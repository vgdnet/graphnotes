from dataclasses import dataclass, field
import hashlib

from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api import graph as graph_api
from app.api import notes as notes_api
from app.api import proposals as proposals_api
from app.api import contributions as contributions_api
from app.api import repository as repository_api
from app.api import webhooks as webhooks_api
from app.core.config import settings
from app.main import app
from app.services.admin import bootstrap_admin
from app.services.github import GitHubAppError, GitHubRepoSnapshot


@dataclass
class MemoryRepo:
    owner: str
    name: str
    files: dict[str, str] = field(default_factory=dict)
    sha: str | None = "sha-1"
    node_id: str = ""
    default_branch: str = "main"
    branches: dict[str, str] = field(default_factory=dict)
    snapshots: dict[str, dict[str, str]] = field(default_factory=dict)
    branch_bases: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.sha:
            self.branches.setdefault(self.default_branch, self.sha)

    def snapshot(self) -> GitHubRepoSnapshot:
        return GitHubRepoSnapshot(
            node_id=self.node_id or f"node-{self.owner}-{self.name}",
            owner=self.owner,
            name=self.name,
            default_branch=self.default_branch,
            html_url=f"https://github.com/{self.owner}/{self.name}",
            sha=self.sha,
            private=False,
        )

    def files_at(self, ref: str) -> dict[str, str]:
        if ref in self.snapshots:
            return self.snapshots[ref]
        if ref in self.branches:
            sha = self.branches[ref]
            if sha in self.snapshots:
                return self.snapshots[sha]
            if sha == self.sha:
                return self.files
        if ref in {self.default_branch, self.sha}:
            return self.files
        raise GitHubAppError("not_found", "repository is not visible to GraphNotes")


class MemoryGitHub:
    def __init__(self, repos: dict[str, MemoryRepo]) -> None:
        self.repos = repos
        self.commits = 0
        self.file_reads = 0

    def _repo(self, owner: str, name: str) -> MemoryRepo:
        key = f"{owner}/{name}".casefold()
        if key not in self.repos:
            raise GitHubAppError("not_found", "repository is not visible to GraphNotes")
        return self.repos[key]

    def _new_sha(self) -> str:
        self.commits += 1
        return f"sha-commit-{self.commits}"

    async def get_repository(self, owner: str, name: str) -> GitHubRepoSnapshot:
        return self._repo(owner, name).snapshot()

    async def list_markdown_blobs(self, owner: str, name: str, ref: str) -> dict[str, str]:
        repo = self._repo(owner, name)
        if repo.sha is None:
            raise GitHubAppError("empty", "repository has no commits yet")
        files = repo.files_at(ref)
        return {
            path: hashlib.sha1(text.encode("utf-8")).hexdigest()
            for path, text in files.items()
            if path.lower().endswith(".md")
        }

    async def list_markdown_files(self, owner: str, name: str, ref: str) -> list[str]:
        return sorted(await self.list_markdown_blobs(owner, name, ref))

    async def get_file(self, owner: str, name: str, path: str, ref: str) -> str:
        repo = self._repo(owner, name)
        files = repo.files_at(ref)
        if path not in files:
            raise GitHubAppError("not_found", "repository is not visible to GraphNotes")
        self.file_reads += 1
        return files[path]

    async def commit_markdown(
        self,
        owner: str,
        name: str,
        branch: str,
        files: dict[str, str],
        message: str,
        expected_sha: str | None,
    ) -> str:
        repo = self._repo(owner, name)
        if branch == repo.default_branch:
            current = repo.sha or ""
        else:
            if branch not in repo.branches:
                raise GitHubAppError("not_found", "repository is not visible to GraphNotes")
            current = repo.branches[branch]
        if expected_sha is not None and expected_sha != current:
            raise GitHubAppError("stale", "personal git changed, retry the take")
        if self.commits >= 100:
            raise GitHubAppError("forbidden", "GraphNotes cannot write to this git yet")
        if branch == repo.default_branch:
            repo.files.update(files)
            repo.sha = self._new_sha()
            repo.branches[repo.default_branch] = repo.sha
            repo.snapshots[repo.sha] = dict(repo.files)
            return repo.sha
        parent = repo.files_at(current)
        if current not in repo.snapshots:
            repo.snapshots[current] = dict(parent)
        updated = dict(parent)
        updated.update(files)
        sha = self._new_sha()
        repo.snapshots[sha] = updated
        repo.branches[branch] = sha
        return sha

    async def create_branch(self, owner: str, name: str, branch: str, sha: str) -> None:
        repo = self._repo(owner, name)
        if branch in repo.branches:
            raise GitHubAppError("stale", "personal git changed, retry the take")
        if sha == repo.sha:
            repo.snapshots.setdefault(sha, dict(repo.files))
        elif sha not in repo.snapshots:
            raise GitHubAppError("not_found", "repository is not visible to GraphNotes")
        repo.branches[branch] = sha
        repo.branch_bases[branch] = sha

    async def merge_branch(
        self,
        owner: str,
        name: str,
        *,
        base: str,
        head: str,
        message: str,
    ) -> str:
        repo = self._repo(owner, name)
        if base != repo.default_branch:
            raise GitHubAppError("not_found", "repository is not visible to GraphNotes")
        head_sha = repo.branches.get(head, head)
        ancestor = repo.branch_bases.get(head)
        if ancestor is None and head_sha in repo.snapshots:
            ancestor = next(
                (base_sha for branch, base_sha in repo.branch_bases.items() if repo.branches.get(branch) == head_sha),
                None,
            )
        if ancestor is None:
            raise GitHubAppError("not_found", "repository is not visible to GraphNotes")
        ancestor_files = repo.snapshots.get(ancestor, dict(repo.files) if ancestor == repo.sha else {})
        if repo.sha and repo.sha not in repo.snapshots:
            repo.snapshots[repo.sha] = dict(repo.files)
        base_files = dict(repo.files)
        head_files = repo.files_at(head_sha)
        base_changed = {
            path for path in set(ancestor_files) | set(base_files) if ancestor_files.get(path) != base_files.get(path)
        }
        head_changed = {
            path for path in set(ancestor_files) | set(head_files) if ancestor_files.get(path) != head_files.get(path)
        }
        if base_changed & head_changed:
            raise GitHubAppError("conflict", "cannot apply this proposal onto the shared rhizome")
        merged = dict(base_files)
        for path in head_changed:
            if path in head_files:
                merged[path] = head_files[path]
            else:
                merged.pop(path, None)
        repo.files.clear()
        repo.files.update(merged)
        repo.sha = self._new_sha()
        repo.branches[repo.default_branch] = repo.sha
        repo.snapshots[repo.sha] = dict(repo.files)
        return repo.sha

    async def restore_revision(
        self,
        owner: str,
        name: str,
        branch: str,
        revision: str,
        message: str,
    ) -> str:
        repo = self._repo(owner, name)
        if branch != repo.default_branch:
            raise GitHubAppError("not_found", "repository is not visible to GraphNotes")
        if repo.sha == revision:
            raise GitHubAppError("stale", "the shared rhizome is already at this revision")
        if revision in repo.snapshots:
            restored = dict(repo.snapshots[revision])
        elif revision == repo.sha:
            restored = dict(repo.files)
        else:
            raise GitHubAppError("not_found", "repository is not visible to GraphNotes")
        if repo.sha:
            repo.snapshots.setdefault(repo.sha, dict(repo.files))
        repo.files.clear()
        repo.files.update(restored)
        repo.sha = self._new_sha()
        repo.branches[repo.default_branch] = repo.sha
        repo.snapshots[repo.sha] = dict(repo.files)
        return repo.sha


def _install(
    monkeypatch: MonkeyPatch,
    github: MemoryGitHub,
) -> MemoryGitHub:
    monkeypatch.setattr(notes_api, "_client", lambda: github)
    monkeypatch.setattr(repository_api, "_client", lambda: github)
    monkeypatch.setattr(proposals_api, "_client", lambda: github)
    monkeypatch.setattr(contributions_api, "_client", lambda: github)
    monkeypatch.setattr(graph_api, "_client", lambda: github)
    monkeypatch.setattr(webhooks_api, "GitHubAppClient", lambda *args, **kwargs: github)
    monkeypatch.setattr(settings, "github_shared_owner", "vgdnet")
    monkeypatch.setattr(settings, "github_shared_name", "rhizome")
    return github


async def _register(client: AsyncClient, username: str) -> None:
    response = await client.post(
        "/auth/register",
        json={
            "username": username,
            "password": "a sufficiently long password",
            "display_name": username.title(),
        },
    )
    assert response.status_code in {200, 201}


async def _bind_shared(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    username: str,
) -> None:
    async with session_factory() as database:
        await bootstrap_admin(database, username)
    connected = await client.post("/repository/connect")
    assert connected.status_code == 200


async def _connect_pair(client: AsyncClient, personal: str) -> None:
    connected = await client.post("/personal/connect", json={"repository": personal})
    assert connected.status_code == 200


def _github() -> MemoryGitHub:
    return MemoryGitHub(
        {
            "vgdnet/rhizome": MemoryRepo(
                owner="vgdnet",
                name="rhizome",
                files={
                    "card.md": "---\ntitle: Card\ntags: [src]\n---\n# Card\nSee [[missing]].\n",
                    "source.md": "# Source\n",
                },
                sha="shared-sha",
            ),
            "vgdnet/guide_psy": MemoryRepo(
                owner="vgdnet",
                name="guide_psy",
                files={"already.md": "# Mine\n"},
                sha="personal-sha",
            ),
            "other/vault": MemoryRepo(
                owner="other",
                name="vault",
                files={},
                sha="other-sha",
            ),
        }
    )


async def test_take_from_shared_is_gone(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = (
        github.repos["vgdnet/rhizome"].files["card.md"]
    )
    github.repos["vgdnet/guide_psy"].files["source.md"] = "# Different\n"
    await _register(client, "efimov")
    await _bind_shared(client, session_factory, "efimov")
    await _connect_pair(client, "vgdnet/guide_psy")

    gone = await client.post(
        "/personal/take-from-shared",
        json={"paths": ["card.md", "source.md"], "expected_sha": "personal-sha"},
    )
    assert gone.status_code == 410
    assert "card.md" not in github.repos["vgdnet/guide_psy"].files or (
        github.repos["vgdnet/guide_psy"].files["card.md"]
        == github.repos["vgdnet/rhizome"].files["card.md"]
    )
    assert github.repos["vgdnet/guide_psy"].files["source.md"] == "# Different\n"

    notes = await client.get("/personal/notes")
    assert notes.status_code == 200
    titles = {item["title"]: item for item in notes.json()["notes"]}
    assert "Card" in titles
    assert titles["Card"]["unresolved_links"] == ["missing"]
    assert "html_url" not in notes.text
    assert "<script>" not in notes.text

    detail = await client.get("/personal/notes/card.md")
    assert detail.status_code == 200
    assert "See [[missing]]." in detail.json()["body"]


async def test_stale_revision_and_two_user_isolation(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    first, session_factory = auth_test_context
    _install(monkeypatch, _github())
    await _register(first, "efimov")
    await _bind_shared(first, session_factory, "efimov")
    await _connect_pair(first, "vgdnet/guide_psy")

    stale = await first.post(
        "/personal/import-md",
        files={"file": ("fresh.md", b"# Fresh\n", "text/markdown")},
        data={"expected_sha": "not-the-head"},
    )
    assert stale.status_code == 409

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as second:
        await _register(second, "other-user")
        await _connect_pair(second, "other/vault")
        stolen = await second.get("/personal/notes/already.md")
        assert stolen.status_code == 404
        empty = await second.get("/personal/notes")
        assert empty.json()["notes"] == []


async def test_import_md_zip_and_xss_inert(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, _ = auth_test_context
    github = _install(monkeypatch, _github())
    await _register(client, "efimov")
    await _connect_pair(client, "vgdnet/guide_psy")

    xss = b'---\ntitle: Evil\n---\n<script>alert(1)</script>\n'
    uploaded = await client.post(
        "/personal/import-md",
        files={"file": ("evil.md", xss, "text/markdown")},
        data={"expected_sha": "personal-sha"},
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["accepted"] == ["evil.md"]
    stored = github.repos["vgdnet/guide_psy"].files["evil.md"]
    assert "<script>alert(1)</script>" in stored

    listed = await client.get("/personal/notes")
    assert listed.status_code == 200
    evil = next(item for item in listed.json()["notes"] if item["path"] == "evil.md")
    assert evil["title"] == "Evil"
    detail = await client.get("/personal/notes/evil.md")
    assert detail.json()["body"].strip() == "<script>alert(1)</script>"

    import io
    import zipfile

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("from-zip.md", "# Zipped\n")
    zipped = await client.post(
        "/personal/import-md",
        files={"file": ("notes.zip", buffer.getvalue(), "application/zip")},
        data={"expected_sha": github.repos["vgdnet/guide_psy"].sha},
    )
    assert zipped.status_code == 200
    assert zipped.json()["accepted"] == ["from-zip.md"]


async def test_zip_traversal_and_python_yaml_are_rejected(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, _ = auth_test_context
    github = _install(monkeypatch, _github())
    await _register(client, "efimov")
    await _connect_pair(client, "vgdnet/guide_psy")

    import io
    import stat
    import zipfile

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("../escape.md", "# no\n")
        archive.writestr("/tmp/abs.md", "# no\n")
        info = zipfile.ZipInfo("link.md")
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, "target")
    bad_zip = await client.post(
        "/personal/import-md",
        files={"file": ("bad.zip", buffer.getvalue(), "application/zip")},
        data={"expected_sha": "personal-sha"},
    )
    assert bad_zip.status_code == 400
    assert "escape.md" not in github.repos["vgdnet/guide_psy"].files

    unsafe = b"---\n!!python/object:os.system ['id']\n---\n# Hi\n"
    yaml_import = await client.post(
        "/personal/import-md",
        files={"file": ("unsafe.md", unsafe, "text/markdown")},
        data={"expected_sha": "personal-sha"},
    )
    assert yaml_import.status_code == 200
    assert yaml_import.json()["accepted"] == ["unsafe.md"]
    parsed = await client.get("/personal/notes/unsafe.md")
    assert "frontmatter is invalid" in " ".join(parsed.json()["warnings"])
    assert parsed.json()["title"] == "Hi"


async def test_shared_notes_are_public_and_take_requires_auth(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    _install(monkeypatch, _github())
    await _register(client, "admin-user")
    await _bind_shared(client, session_factory, "admin-user")

    anonymous = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    async with anonymous:
        shared = await anonymous.get("/shared/notes")
        assert shared.status_code == 200
        assert {item["path"] for item in shared.json()["notes"]} == {"card.md", "source.md"}
        take = await anonymous.post("/personal/take-from-shared", json={"paths": ["card.md"]})
        assert take.status_code == 401
        personal = await anonymous.get("/personal/notes")
        assert personal.status_code == 401


async def test_upload_without_git_feeds_differ(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    _install(monkeypatch, _github())
    await _register(client, "upload-admin")
    await _bind_shared(client, session_factory, "upload-admin")

    author = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(author, "no-git-user")
    empty = await author.get("/differ")
    assert empty.status_code == 200
    assert empty.json()["differences"] == []

    uploaded = await author.post(
        "/personal/import-md",
        files={"file": ("fresh.md", b"# Fresh from upload\n", "text/markdown")},
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["accepted"] == ["fresh.md"]
    assert uploaded.json()["revision"] is None

    notes = await author.get("/personal/notes")
    assert {item["path"] for item in notes.json()["notes"]} == {"fresh.md"}

    differ = await author.get("/differ")
    assert differ.status_code == 200
    kinds = {item["path"]: item["kind"] for item in differ.json()["differences"]}
    assert kinds["fresh.md"] == "added"

    created = await author.post("/proposals", json={"paths": ["fresh.md"]})
    assert created.status_code == 200
    assert created.json()["added"] == ["fresh.md"]

    history = await author.get("/personal/uploads")
    assert history.status_code == 200
    events = history.json()["events"]
    assert events[0]["path"] == "fresh.md"
    assert events[0]["content_hash"]

    contrib = await author.get("/contributions/me")
    assert contrib.status_code == 200
    nodes = {node["path"]: node for node in contrib.json()["notes"]}
    assert nodes["fresh.md"]["state"] == "proposed"

    published = await client.post(
        f"/proposals/{created.json()['id']}/approve", json={"reason": ""}
    )
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    after = await author.get("/differ")
    leftover = {item["path"] for item in after.json()["differences"]}
    assert "fresh.md" not in leftover

    accepted = await author.get("/contributions/me")
    assert accepted.status_code == 200
    states = {node["path"]: node["state"] for node in accepted.json()["notes"]}
    assert states["fresh.md"] == "accepted"
    await author.aclose()
