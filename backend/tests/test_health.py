from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch

from app.api import health as health_api
from app.main import app


async def test_health() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_docs_load_openapi_behind_api_prefix() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        spec = await client.get("/openapi.json")
        docs = await client.get("/docs")

    assert spec.status_code == 200
    assert spec.headers["content-type"].startswith("application/json")
    body = spec.json()
    assert str(body["openapi"]).startswith("3.")
    assert any(server.get("url") == "/api" for server in body.get("servers", []))
    assert docs.status_code == 200
    assert "/api/openapi.json" in docs.text


class UnavailableSession:
    async def __aenter__(self) -> "UnavailableSession":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def execute(self, _: object) -> None:
        raise ConnectionRefusedError


async def test_database_health_reports_unavailable_database(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        health_api,
        "async_session_factory",
        lambda: UnavailableSession(),
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/health/db")

    assert response.status_code == 503
    assert response.json() == {"detail": "database unavailable"}
