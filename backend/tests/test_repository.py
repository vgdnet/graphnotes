import hashlib
import hmac

from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api import repository as repository_api
from app.api import webhooks as webhooks_api
from app.core.config import settings
from app.main import app
from app.models.audit_event import AuditEvent
from app.services.admin import bootstrap_admin
from app.services.github import GitHubAppError, GitHubRepoSnapshot
from sqlalchemy import select


def _snapshot(owner: str, name: str, sha: str | None = "abc123") -> GitHubRepoSnapshot:
    return GitHubRepoSnapshot(
        node_id=f"node-{owner}-{name}",
        owner=owner,
        name=name,
        default_branch="main",
        html_url=f"https://github.com/{owner}/{name}",
        sha=sha,
        private=False,
    )


class FakeGitHubClient:
    def __init__(self, repos: dict[str, GitHubRepoSnapshot]) -> None:
        self.repos = repos

    async def get_repository(self, owner: str, name: str) -> GitHubRepoSnapshot:
        key = f"{owner}/{name}".casefold()
        if key not in self.repos:
            raise GitHubAppError("not_found", "repository is not visible to GraphNotes")
        return self.repos[key]

    async def list_markdown_files(self, owner: str, name: str, ref: str) -> list[str]:
        return []

    async def get_file(self, owner: str, name: str, path: str, ref: str) -> str:
        raise GitHubAppError("not_found", "repository is not visible to GraphNotes")


def _install_fake(monkeypatch: MonkeyPatch, repos: dict[str, GitHubRepoSnapshot]) -> FakeGitHubClient:
    client = FakeGitHubClient(repos)
    monkeypatch.setattr(repository_api, "_client", lambda: client)
    monkeypatch.setattr(webhooks_api, "GitHubAppClient", lambda *args, **kwargs: client)
    monkeypatch.setattr(settings, "github_shared_owner", "vgdnet")
    monkeypatch.setattr(settings, "github_shared_name", "rhizome")
    return client


def _assert_no_secrets(payload: str) -> None:
    assert "password_hash" not in payload
    assert "BEGIN" not in payload
    assert "html_url" not in payload
    assert "observed_sha" not in payload
    assert "node-" not in payload
    assert "github-app.pem" not in payload


async def test_public_status_without_shared_binding(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, _ = auth_test_context
    _install_fake(monkeypatch, {})
    response = await client.get("/repository/status")
    assert response.status_code == 200
    body = response.json()
    assert body["shared"]["connected"] is False
    assert body["personal"] is None
    _assert_no_secrets(response.text)


async def test_user_cannot_connect_shared_and_admin_can(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    _install_fake(
        monkeypatch,
        {"vgdnet/rhizome": _snapshot("vgdnet", "rhizome", "b675b76dca9a")},
    )
    await client.post(
        "/auth/register",
        json={
            "username": "plain-user",
            "password": "a sufficiently long password",
            "display_name": "Plain",
        },
    )
    assert (await client.post("/repository/connect")).status_code == 403

    async with session_factory() as database:
        await bootstrap_admin(database, "plain-user")

    connected = await client.post("/repository/connect")
    assert connected.status_code == 200
    body = connected.json()["shared"]
    assert body["connected"] is True
    assert body["owner"] == "vgdnet"
    assert body["name"] == "rhizome"
    assert body["has_content"] is True
    assert body["status"] == "connected"
    _assert_no_secrets(connected.text)

    status = await client.get("/repository/status")
    assert status.json()["shared"]["connected"] is True


async def test_personal_connect_isolation_and_shared_rejection(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    first, session_factory = auth_test_context
    _install_fake(
        monkeypatch,
        {
            "vgdnet/rhizome": _snapshot("vgdnet", "rhizome"),
            "vgdnet/guide_psy": _snapshot("vgdnet", "guide_psy", "2656006c2308"),
        },
    )
    await first.post(
        "/auth/register",
        json={
            "username": "efimov",
            "password": "a sufficiently long password",
            "display_name": "Efimov",
        },
    )
    rejected_shared = await first.post(
        "/personal/connect",
        json={"repository": "vgdnet/rhizome"},
    )
    assert rejected_shared.status_code == 400

    invalid = await first.post(
        "/personal/connect",
        json={"repository": "http://169.254.169.254/secret"},
    )
    assert invalid.status_code == 400

    connected = await first.post(
        "/personal/connect",
        json={"repository": "https://github.com/vgdnet/guide_psy"},
    )
    assert connected.status_code == 200
    assert connected.json()["personal"]["name"] == "guide_psy"
    assert connected.json()["personal"]["has_content"] is True
    _assert_no_secrets(connected.text)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as second:
        await second.post(
            "/auth/register",
            json={
                "username": "other-user",
                "password": "a sufficiently long password",
                "display_name": "Other",
            },
        )
        stolen = await second.post(
            "/personal/connect",
            json={"repository": "vgdnet/guide_psy"},
        )
        assert stolen.status_code == 409
        other_status = await second.get("/repository/status")
        assert other_status.json()["personal"] is None


async def test_webhook_signature_and_idempotency(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    _install_fake(monkeypatch, {"vgdnet/rhizome": _snapshot("vgdnet", "rhizome")})
    monkeypatch.setattr(settings, "github_webhook_secret", "webhook-secret")

    await client.post(
        "/auth/register",
        json={
            "username": "hook-admin",
            "password": "a sufficiently long password",
            "display_name": "Hook Admin",
        },
    )
    async with session_factory() as database:
        await bootstrap_admin(database, "hook-admin")
    assert (await client.post("/repository/connect")).status_code == 200

    body = b'{"repository":{"node_id":"node-vgdnet-rhizome"}}'
    digest = hmac.new(b"webhook-secret", body, hashlib.sha256).hexdigest()
    invalid = await client.post(
        "/webhooks/github",
        content=body,
        headers={
            "X-Hub-Signature-256": "sha256=deadbeef",
            "X-GitHub-Delivery": "delivery-1",
            "X-GitHub-Event": "push",
        },
    )
    assert invalid.status_code == 400

    headers = {
        "X-Hub-Signature-256": f"sha256={digest}",
        "X-GitHub-Delivery": "delivery-1",
        "X-GitHub-Event": "push",
        "Content-Type": "application/json",
    }
    first = await client.post("/webhooks/github", content=body, headers=headers)
    assert first.status_code == 202
    duplicate = await client.post("/webhooks/github", content=body, headers=headers)
    assert duplicate.status_code == 202
    assert duplicate.json()["status"] == "duplicate"

    async with session_factory() as database:
        actions = {
            event.action
            for event in (await database.scalars(select(AuditEvent))).all()
        }
        assert "repository.shared_connected" in actions
