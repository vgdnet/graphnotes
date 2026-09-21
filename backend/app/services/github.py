from __future__ import annotations

import unicodedata
from dataclasses import dataclass

# Knowledge does not use GitHub. ADR-006 is source-code delivery only.
# No create_branch / merge_branch / commit_markdown. The App client cannot
# talk to GitHub.


class GitHubAppError(Exception):
    def __init__(self, status: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass(frozen=True)
class GitHubRepoSnapshot:
    node_id: str
    owner: str
    name: str
    default_branch: str
    html_url: str
    sha: str | None
    private: bool


def _gone() -> GitHubAppError:
    return GitHubAppError("unavailable", "knowledge does not use GitHub")


class GitHubAppClient:
    """Disconnected. Leftover type for unused signatures. Does not call GitHub."""

    def __init__(self, timeout_seconds: float | None = None) -> None:
        del timeout_seconds

    async def get_repository(self, owner: str, name: str) -> GitHubRepoSnapshot:
        del owner, name
        raise _gone()

    async def list_markdown_blobs(self, owner: str, name: str, ref: str) -> dict[str, str]:
        del owner, name, ref
        raise _gone()

    async def list_markdown_files(self, owner: str, name: str, ref: str) -> list[str]:
        del owner, name, ref
        raise _gone()

    async def get_blob(self, owner: str, name: str, sha: str) -> str:
        del owner, name, sha
        raise _gone()

    async def get_file(self, owner: str, name: str, path: str, ref: str) -> str:
        del owner, name, path, ref
        raise _gone()


def folder_note_path(prefix: str) -> str | None:
    text = unicodedata.normalize("NFC", prefix.replace("\\", "/").strip().strip("/"))
    if not text:
        return None
    name = text.rsplit("/", 1)[-1]
    if not name or name.startswith("."):
        return None
    return f"{text}/{name}.md"


def split_tree_entries(
    entries: object,
    *,
    prefix: str = "",
) -> tuple[dict[str, str], list[tuple[str, str]]]:
    blobs: dict[str, str] = {}
    gitlinks: list[tuple[str, str]] = []
    if not isinstance(entries, list):
        return blobs, gitlinks
    head = unicodedata.normalize("NFC", prefix.replace("\\", "/").strip().strip("/"))
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        raw = str(entry.get("path") or "").replace("\\", "/")
        path = f"{head}/{raw}" if head else raw
        path = unicodedata.normalize("NFC", path)
        sha = str(entry.get("sha") or "")
        kind = str(entry.get("type") or "")
        mode = str(entry.get("mode") or "")
        if kind == "blob":
            indexed = _indexable_markdown_path(path)
            if indexed and sha:
                blobs[indexed] = sha
            continue
        if (kind == "commit" or mode == "160000") and sha:
            link = _indexable_gitlink_path(path)
            if link:
                gitlinks.append((link, sha))
    return blobs, gitlinks


def _indexable_markdown_path(path: str) -> str | None:
    text = unicodedata.normalize("NFC", path.replace("\\", "/").strip().lstrip("/"))
    if not text.lower().endswith(".md"):
        return None
    parts = text.split("/")
    if any(part in {"", ".", ".."} or part.startswith(".") for part in parts):
        return None
    return text


def _indexable_gitlink_path(path: str) -> str | None:
    text = unicodedata.normalize("NFC", path.replace("\\", "/").strip().strip("/"))
    if not text:
        return None
    parts = text.split("/")
    if any(part in {"", ".", ".."} or part.startswith(".") for part in parts):
        return None
    return text
