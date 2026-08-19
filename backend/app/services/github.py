from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

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
                f"/repos/{owner}/{name}/commits/{branch}",
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
    ) -> dict[str, object]:
        return await self._request(client, "GET", path, token)

    async def _get_optional(
        self,
        client: httpx.AsyncClient,
        path: str,
        token: str,
    ) -> tuple[dict[str, object] | None, GitHubAppError | None]:
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
    ) -> dict[str, object]:
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "graphnotes",
        }
        try:
            response = await client.request(method, f"{GITHUB_API}{path}", headers=headers)
        except httpx.TimeoutException as exc:
            raise GitHubAppError("unavailable", "GitHub timed out") from exc
        except httpx.HTTPError as exc:
            raise GitHubAppError("unavailable", "GitHub is unreachable") from exc

        if response.status_code == 409:
            raise GitHubAppError("empty", "repository has no commits yet")
        if response.status_code in {403, 429}:
            raise GitHubAppError("rate_limited", "GitHub rate limit reached")
        if response.status_code == 404:
            raise GitHubAppError("not_found", "repository is not visible to GraphNotes")
        if response.status_code >= 400:
            raise GitHubAppError("error", "GitHub request failed")
        payload = response.json()
        if not isinstance(payload, dict):
            raise GitHubAppError("error", "GitHub returned an unexpected payload")
        return payload
