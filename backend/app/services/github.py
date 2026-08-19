from __future__ import annotations

import base64
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
import jwt

from app.core.config import settings

GITHUB_API = "https://api.github.com"


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


def _read_private_key() -> str:
    path = Path(settings.github_app_private_key_path)
    if not path.is_file():
        raise GitHubAppError("unavailable", "GitHub App private key is not configured")
    return path.read_text(encoding="utf-8")


def _app_jwt() -> str:
    if not settings.github_app_id:
        raise GitHubAppError("unavailable", "GitHub App is not configured")
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + 540,
        "iss": settings.github_app_id,
    }
    return jwt.encode(payload, _read_private_key(), algorithm="RS256")


class GitHubAppClient:
    def __init__(self, timeout_seconds: float | None = None) -> None:
        self._timeout = timeout_seconds or settings.github_api_timeout_seconds

    async def get_repository(self, owner: str, name: str) -> GitHubRepoSnapshot:
        token = await self._installation_token()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            repo_response = await self._get(
                client,
                f"/repos/{owner}/{name}",
                token,
            )
            branch = str(repo_response.get("default_branch") or "main")
            sha: str | None = None
            commit_response, commit_error = await self._get_optional(
                client,
                f"/repos/{owner}/{name}/commits/{quote(branch, safe='')}",
                token,
            )
            if commit_response is not None:
                sha = commit_response.get("sha")
            elif commit_error is not None and commit_error.status != "empty":
                raise commit_error
            owner_login = ((repo_response.get("owner") or {}).get("login")) or owner
            return GitHubRepoSnapshot(
                node_id=str(repo_response["node_id"]),
                owner=str(owner_login),
                name=str(repo_response["name"]),
                default_branch=branch,
                html_url=str(repo_response["html_url"]),
                sha=str(sha) if sha else None,
                private=bool(repo_response.get("private")),
            )

    async def list_markdown_blobs(self, owner: str, name: str, ref: str) -> dict[str, str]:
        token = await self._installation_token()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            commit = await self._get(
                client,
                f"/repos/{owner}/{name}/commits/{quote(ref, safe='')}",
                token,
            )
            commit_body = commit.get("commit") if isinstance(commit.get("commit"), dict) else {}
            tree = commit_body.get("tree") if isinstance(commit_body, dict) else None
            tree_sha = tree.get("sha") if isinstance(tree, dict) else None
            if not tree_sha:
                raise GitHubAppError("error", "GitHub request failed")
            payload = await self._get(
                client,
                f"/repos/{owner}/{name}/git/trees/{tree_sha}",
                token,
                params={"recursive": "1"},
            )
        if payload.get("truncated"):
            raise GitHubAppError("error", "repository tree is too large to list")
        entries = payload.get("tree")
        if not isinstance(entries, list):
            return {}
        blobs: dict[str, str] = {}
        for entry in entries:
            if not isinstance(entry, dict) or entry.get("type") != "blob":
                continue
            path = str(entry.get("path") or "")
            sha = str(entry.get("sha") or "")
            if path.lower().endswith(".md") and not path.startswith(".") and sha:
                blobs[path] = sha
        return blobs

    async def list_markdown_files(self, owner: str, name: str, ref: str) -> list[str]:
        return sorted(await self.list_markdown_blobs(owner, name, ref))

    async def get_file(self, owner: str, name: str, path: str, ref: str) -> str:
        token = await self._installation_token()
        encoded = quote(path, safe="/")
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            payload = await self._get(
                client,
                f"/repos/{owner}/{name}/contents/{encoded}",
                token,
                params={"ref": ref},
            )
        if payload.get("type") != "file":
            raise GitHubAppError("not_found", "file is not visible to GraphNotes")
        encoding = payload.get("encoding")
        content = payload.get("content")
        if encoding != "base64" or not isinstance(content, str):
            raise GitHubAppError("error", "GitHub returned an unexpected payload")
        try:
            raw = base64.b64decode(content)
            text = raw.decode("utf-8-sig")
        except (ValueError, UnicodeDecodeError) as exc:
            raise GitHubAppError("error", "file is not UTF-8 Markdown") from exc
        if b"\x00" in raw:
            raise GitHubAppError("error", "file is not UTF-8 Markdown")
        return text

    async def commit_markdown(
        self,
        owner: str,
        name: str,
        branch: str,
        files: dict[str, str],
        message: str,
        expected_sha: str | None,
    ) -> str:
        if not files:
            raise GitHubAppError("error", "nothing to commit")
        token = await self._installation_token()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            current_sha, ref_error = await self._head_sha(client, owner, name, branch, token)
            if ref_error is not None and ref_error.status not in {"empty", "not_found"}:
                raise ref_error
            if expected_sha is not None and expected_sha != (current_sha or ""):
                raise GitHubAppError("stale", "personal git changed, retry the take")
            tree_items: list[dict[str, str]] = []
            for path, text in files.items():
                blob = await self._request(
                    client,
                    "POST",
                    f"/repos/{owner}/{name}/git/blobs",
                    token,
                    json_body={"content": text, "encoding": "utf-8"},
                )
                blob_sha = blob.get("sha")
                if not isinstance(blob_sha, str):
                    raise GitHubAppError("error", "GitHub request failed")
                tree_items.append(
                    {"path": path, "mode": "100644", "type": "blob", "sha": blob_sha}
                )
            tree_body: dict[str, object] = {"tree": tree_items}
            if current_sha:
                commit = await self._get(
                    client,
                    f"/repos/{owner}/{name}/git/commits/{current_sha}",
                    token,
                )
                base_tree = commit.get("tree") if isinstance(commit.get("tree"), dict) else None
                if isinstance(base_tree, dict) and isinstance(base_tree.get("sha"), str):
                    tree_body["base_tree"] = base_tree["sha"]
            new_tree = await self._request(
                client,
                "POST",
                f"/repos/{owner}/{name}/git/trees",
                token,
                json_body=tree_body,
            )
            tree_sha = new_tree.get("sha")
            if not isinstance(tree_sha, str):
                raise GitHubAppError("error", "GitHub request failed")
            commit_body: dict[str, object] = {
                "message": message,
                "tree": tree_sha,
                "parents": [current_sha] if current_sha else [],
            }
            new_commit = await self._request(
                client,
                "POST",
                f"/repos/{owner}/{name}/git/commits",
                token,
                json_body=commit_body,
            )
            commit_sha = new_commit.get("sha")
            if not isinstance(commit_sha, str):
                raise GitHubAppError("error", "GitHub request failed")
            if current_sha:
                await self._request(
                    client,
                    "PATCH",
                    f"/repos/{owner}/{name}/git/refs/heads/{quote(branch, safe='')}",
                    token,
                    json_body={"sha": commit_sha, "force": False},
                )
            else:
                await self._request(
                    client,
                    "POST",
                    f"/repos/{owner}/{name}/git/refs",
                    token,
                    json_body={"ref": f"refs/heads/{branch}", "sha": commit_sha},
                )
            return commit_sha

    async def create_branch(self, owner: str, name: str, branch: str, sha: str) -> None:
        token = await self._installation_token()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            await self._request(
                client,
                "POST",
                f"/repos/{owner}/{name}/git/refs",
                token,
                json_body={"ref": f"refs/heads/{branch}", "sha": sha},
            )

    async def merge_branch(
        self,
        owner: str,
        name: str,
        *,
        base: str,
        head: str,
        message: str,
    ) -> str:
        token = await self._installation_token()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            payload = await self._request(
                client,
                "POST",
                f"/repos/{owner}/{name}/merges",
                token,
                json_body={"base": base, "head": head, "commit_message": message},
                conflict_on_409=True,
            )
        sha = payload.get("sha")
        if not isinstance(sha, str):
            raise GitHubAppError("error", "GitHub request failed")
        return sha

    async def restore_revision(
        self,
        owner: str,
        name: str,
        branch: str,
        revision: str,
        message: str,
    ) -> str:
        token = await self._installation_token()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            current_sha, ref_error = await self._head_sha(client, owner, name, branch, token)
            if ref_error is not None:
                raise ref_error
            if not current_sha:
                raise GitHubAppError("empty", "repository has no commits yet")
            if current_sha == revision:
                raise GitHubAppError("stale", "the shared rhizome is already at this revision")
            old = await self._get(client, f"/repos/{owner}/{name}/git/commits/{revision}", token)
            tree = old.get("tree") if isinstance(old.get("tree"), dict) else None
            tree_sha = tree.get("sha") if isinstance(tree, dict) else None
            if not isinstance(tree_sha, str):
                raise GitHubAppError("error", "GitHub request failed")
            new_commit = await self._request(
                client,
                "POST",
                f"/repos/{owner}/{name}/git/commits",
                token,
                json_body={
                    "message": message,
                    "tree": tree_sha,
                    "parents": [current_sha],
                },
            )
            commit_sha = new_commit.get("sha")
            if not isinstance(commit_sha, str):
                raise GitHubAppError("error", "GitHub request failed")
            await self._request(
                client,
                "PATCH",
                f"/repos/{owner}/{name}/git/refs/heads/{quote(branch, safe='')}",
                token,
                json_body={"sha": commit_sha, "force": False},
            )
            return commit_sha

    async def _head_sha(
        self,
        client: httpx.AsyncClient,
        owner: str,
        name: str,
        branch: str,
        token: str,
    ) -> tuple[str | None, GitHubAppError | None]:
        payload, error = await self._get_optional(
            client,
            f"/repos/{owner}/{name}/git/ref/heads/{quote(branch, safe='')}",
            token,
        )
        if error is not None:
            return None, error
        obj = payload.get("object") if payload else None
        sha = obj.get("sha") if isinstance(obj, dict) else None
        if not isinstance(sha, str):
            return None, GitHubAppError("error", "GitHub request failed")
        return sha, None

    async def _installation_token(self) -> str:
        if not settings.github_app_installation_id:
            raise GitHubAppError("unavailable", "GitHub App installation is not configured")
        app_token = _app_jwt()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            body = await self._request(
                client,
                "POST",
                f"/app/installations/{settings.github_app_installation_id}/access_tokens",
                app_token,
            )
        token = body.get("token")
        if not token:
            raise GitHubAppError("error", "GitHub App did not return an installation token")
        return str(token)

    async def _get(
        self,
        client: httpx.AsyncClient,
        path: str,
        token: str,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        return await self._request(client, "GET", path, token, params=params)

    async def _get_optional(
        self,
        client: httpx.AsyncClient,
        path: str,
        token: str,
    ) -> tuple[dict[str, Any] | None, GitHubAppError | None]:
        try:
            return await self._request(client, "GET", path, token), None
        except GitHubAppError as exc:
            return None, exc

    async def _request(
        self,
        client: httpx.AsyncClient,
        method: str,
        path: str,
        token: str,
        *,
        params: dict[str, str] | None = None,
        json_body: dict[str, object] | None = None,
        conflict_on_409: bool = False,
    ) -> dict[str, Any]:
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "graphnotes",
        }
        try:
            response = await client.request(
                method,
                f"{GITHUB_API}{path}",
                headers=headers,
                params=params,
                json=json_body,
            )
        except httpx.TimeoutException as exc:
            raise GitHubAppError("unavailable", "GitHub timed out") from exc
        except httpx.HTTPError as exc:
            raise GitHubAppError("unavailable", "GitHub is unreachable") from exc

        if response.status_code == 409:
            if conflict_on_409:
                raise GitHubAppError("conflict", "cannot apply this proposal onto the shared rhizome")
            raise GitHubAppError("empty", "repository has no commits yet")
        if response.status_code == 422:
            raise GitHubAppError("stale", "personal git changed, retry the take")
        if response.status_code == 429:
            raise GitHubAppError("rate_limited", "GitHub rate limit reached")
        if response.status_code == 403:
            remaining = response.headers.get("x-ratelimit-remaining")
            if remaining == "0":
                raise GitHubAppError("rate_limited", "GitHub rate limit reached")
            raise GitHubAppError(
                "forbidden",
                "GraphNotes cannot write to this git yet",
            )
        if response.status_code == 404:
            raise GitHubAppError("not_found", "repository is not visible to GraphNotes")
        if response.status_code >= 400:
            raise GitHubAppError("error", "GitHub request failed")
        payload = response.json()
        if not isinstance(payload, dict):
            raise GitHubAppError("error", "GitHub returned an unexpected payload")
        return payload
