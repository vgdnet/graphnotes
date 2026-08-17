from collections.abc import AsyncIterator

from fastapi import Response
from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.db.session import get_db_session
from app.main import app
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.auth import verify_password
from app.services.session_cookie import set_session_cookie


async def test_registration_session_refresh_and_logout(
    auth_test_context: tuple[
        AsyncClient,
        async_sessionmaker[AsyncSession],
    ],
) -> None:
    client, session_factory = auth_test_context
    registration = await client.post(
        "/auth/register",
        json={
            "username": "Alice.Example",
            "password": "correct horse battery staple",
            "display_name": "Alice",
            "email": "Alice@Example.com",
        },
    )

    assert registration.status_code == 201
    assert registration.json()["username"] == "alice.example"
    assert registration.json()["email"] == "alice@example.com"
    assert registration.json()["role"] == "user"
    assert "password" not in registration.text
    assert "httponly" in registration.headers["set-cookie"].lower()
    assert "samesite=lax" in registration.headers["set-cookie"].lower()

    async with session_factory() as database:
        result = await database.execute(
            select(User).where(User.username == "alice.example")
        )
        user = result.scalar_one()
        assert user.password_hash != "correct horse battery staple"
        assert verify_password(user.password_hash, "correct horse battery staple")
        auth_session = (await database.execute(select(AuthSession))).scalar_one()
        raw_token = client.cookies.get("graphnotes_session")
        assert raw_token
        assert auth_session.token_hash != raw_token
        assert raw_token not in auth_session.token_hash

    duplicate = await client.post(
        "/auth/register",
        json={
            "username": "ALICE.EXAMPLE",
            "password": "another secure password",
            "display_name": "Another Alice",
        },
    )
    assert duplicate.status_code == 409

    me = await client.get("/users/me")
    assert me.status_code == 200
    assert me.json()["display_name"] == "Alice"

    old_token = client.cookies.get("graphnotes_session")
    refreshed = await client.post("/auth/refresh")
    new_token = client.cookies.get("graphnotes_session")
    assert refreshed.status_code == 200
    assert old_token
    assert new_token
    assert new_token != old_token

    async def existing_override() -> AsyncIterator[AsyncSession]:
        async with session_factory() as database:
            yield database

    app.dependency_overrides[get_db_session] = existing_override
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
        cookies={"graphnotes_session": old_token},
    ) as stale_client:
        stale_response = await stale_client.get("/users/me")
    assert stale_response.status_code == 401

    logout = await client.post("/auth/logout")
    assert logout.status_code == 204
    assert (await client.get("/users/me")).status_code == 401


async def test_login_failures_and_inactive_account(
    auth_test_context: tuple[
        AsyncClient,
        async_sessionmaker[AsyncSession],
    ],
) -> None:
    client, session_factory = auth_test_context
    await client.post(
        "/auth/register",
        json={
            "username": "bob",
            "password": "a sufficiently long password",
            "display_name": "Bob",
        },
    )
    await client.post("/auth/logout")

    bad_password = await client.post(
        "/auth/login",
        json={"username": "bob", "password": "not the password"},
    )
    assert bad_password.status_code == 401
    assert bad_password.json() == {"detail": "invalid username or password"}

    login = await client.post(
        "/auth/login",
        json={"username": "BOB", "password": "a sufficiently long password"},
    )
    assert login.status_code == 200

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as refresh_client:
        second_login = await refresh_client.post(
            "/auth/login",
            json={
                "username": "bob",
                "password": "a sufficiently long password",
            },
        )
        assert second_login.status_code == 200

        async with session_factory() as database:
            result = await database.execute(
                select(User).where(User.username == "bob")
            )
            user = result.scalar_one()
            user.is_active = False
            await database.commit()

        assert (await client.get("/users/me")).status_code == 403
        assert client.cookies.get("graphnotes_session") is None
        inactive_refresh = await refresh_client.post("/auth/refresh")
        assert inactive_refresh.status_code == 403
        assert refresh_client.cookies.get("graphnotes_session") is None
    await client.post("/auth/logout")
    inactive_login = await client.post(
        "/auth/login",
        json={"username": "bob", "password": "a sufficiently long password"},
    )
    assert inactive_login.status_code == 403


async def test_registration_validation(
    auth_test_context: tuple[
        AsyncClient,
        async_sessionmaker[AsyncSession],
    ],
) -> None:
    client, _ = auth_test_context

    short_password = await client.post(
        "/auth/register",
        json={
            "username": "valid-user",
            "password": "too short",
            "display_name": "Valid User",
        },
    )
    assert short_password.status_code == 422

    invalid_username = await client.post(
        "/auth/register",
        json={
            "username": "not valid!",
            "password": "a sufficiently long password",
            "display_name": "Valid User",
        },
    )
    assert invalid_username.status_code == 422


def test_cookie_secure_policy(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "cookie_secure", True)
    secure_response = Response()
    set_session_cookie(secure_response, "token")
    assert "Secure" in secure_response.headers["set-cookie"]
    assert "HttpOnly" in secure_response.headers["set-cookie"]
    assert "SameSite=lax" in secure_response.headers["set-cookie"]

    monkeypatch.setattr(settings, "cookie_secure", False)
    test_response = Response()
    set_session_cookie(test_response, "token")
    assert "Secure" not in test_response.headers["set-cookie"]
