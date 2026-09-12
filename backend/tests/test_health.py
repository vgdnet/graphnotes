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
