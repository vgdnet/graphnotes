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
from app.models.audit_event import AuditEvent
from app.models.user import User
from app.services.admin import AdminBootstrapError, bootstrap_admin
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

    async with session_factory() as database:
        actions = set((await database.scalars(select(AuditEvent.action))).all())
        assert "auth.registration_succeeded" in actions
        assert "auth.registration_failed" in actions
        assert "auth.logout" in actions


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

    unknown_user = await client.post(
        "/auth/login",
        json={"username": "unknown-user", "password": "not the password"},
    )
    assert unknown_user.status_code == 401
    assert unknown_user.json() == {"detail": "invalid username or password"}

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

    async with session_factory() as database:
        actions = (await database.scalars(select(AuditEvent.action))).all()
        assert "auth.login_succeeded" in actions
        assert actions.count("auth.login_failed") == 3


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

    long_password = await client.post(
        "/auth/register",
        json={
            "username": "valid-user",
            "password": "x" * 129,
            "display_name": "Valid User",
        },
    )
    assert long_password.status_code == 422

    invalid_username = await client.post(
        "/auth/register",
        json={
            "username": "not valid!",
            "password": "a sufficiently long password",
            "display_name": "Valid User",
        },
    )
    assert invalid_username.status_code == 422

    attempted_escalation = await client.post(
        "/auth/register",
        json={
            "username": "ordinary-user",
            "password": "a sufficiently long password",
            "display_name": "Ordinary User",
            "role": "admin",
        },
    )
    assert attempted_escalation.status_code == 201
    assert attempted_escalation.json()["role"] == "user"


async def test_admin_rbac_management_last_admin_and_audit(
    auth_test_context: tuple[
        AsyncClient,
        async_sessionmaker[AsyncSession],
    ],
) -> None:
    admin_client, session_factory = auth_test_context
    admin_registration = await admin_client.post(
        "/auth/register",
        json={
            "username": "initial-admin",
            "password": "initial admin password",
            "display_name": "Initial Admin",
        },
    )
    admin_id = admin_registration.json()["id"]
    assert (await admin_client.get("/admin/users")).status_code == 403

    async with session_factory() as database:
        bootstrapped = await bootstrap_admin(database, "INITIAL-ADMIN")
        assert bootstrapped.role == "admin"

    assert (await admin_client.get("/admin/users")).status_code == 200

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as managed_client:
        managed_registration = await managed_client.post(
            "/auth/register",
            json={
                "username": "managed-user",
                "password": "managed user password",
                "display_name": "Managed User",
                "role": "admin",
            },
        )
        managed_id = managed_registration.json()["id"]
        assert managed_registration.json()["role"] == "user"
        assert (await managed_client.get("/admin/users")).status_code == 403

        users_response = await admin_client.get("/admin/users")
        assert users_response.status_code == 200
        assert len(users_response.json()["users"]) == 2
        assert "password_hash" not in users_response.text
        assert "token_hash" not in users_response.text

        editor_update = await admin_client.patch(
            f"/admin/users/{managed_id}",
            json={"role": "editor"},
        )
        assert editor_update.status_code == 200
        assert editor_update.json()["role"] == "editor"
        assert (await managed_client.get("/admin/users")).status_code == 403
        forbidden_patch = await managed_client.patch(
            f"/admin/users/{managed_id}",
            json={"role": "admin"},
        )
        assert forbidden_patch.status_code == 403

        admin_update = await admin_client.patch(
            f"/admin/users/{managed_id}",
            json={"role": "admin"},
        )
        assert admin_update.status_code == 200
        assert (await managed_client.get("/admin/users")).status_code == 200

        demote_initial = await managed_client.patch(
            f"/admin/users/{admin_id}",
            json={"role": "user"},
        )
        assert demote_initial.status_code == 200

        block_initial = await managed_client.patch(
            f"/admin/users/{admin_id}",
            json={"is_active": False},
        )
        assert block_initial.status_code == 200
        assert (await admin_client.get("/users/me")).status_code == 401
        reactivate_initial = await managed_client.patch(
            f"/admin/users/{admin_id}",
            json={"is_active": True},
        )
        assert reactivate_initial.status_code == 200

        block_last_admin = await managed_client.patch(
            f"/admin/users/{managed_id}",
            json={"is_active": False},
        )
        assert block_last_admin.status_code == 409
        assert "last active admin" in block_last_admin.json()["detail"]
        demote_last_admin = await managed_client.patch(
            f"/admin/users/{managed_id}",
            json={"role": "editor"},
        )
        assert demote_last_admin.status_code == 409

        empty_update = await managed_client.patch(
            f"/admin/users/{admin_id}",
            json={},
        )
        assert empty_update.status_code == 422

    async with session_factory() as database:
        events = (await database.scalars(select(AuditEvent))).all()
        actions = {event.action for event in events}
        assert "admin.bootstrap_succeeded" in actions
        assert "admin.user_role_changed" in actions
        assert "admin.user_active_changed" in actions
        serialized_events = " ".join(
            f"{event.action} {event.subject_username} {event.details}"
            for event in events
        )
        assert "initial admin password" not in serialized_events
        assert "managed user password" not in serialized_events
        assert "graphnotes_session" not in serialized_events


async def test_admin_bootstrap_refuses_escalation_and_supports_recovery(
    auth_test_context: tuple[
        AsyncClient,
        async_sessionmaker[AsyncSession],
    ],
) -> None:
    client, session_factory = auth_test_context
    for username in ("first-admin", "recovery-admin"):
        await client.post(
            "/auth/register",
            json={
                "username": username,
                "password": "a sufficiently long password",
                "display_name": username,
            },
        )

    async with session_factory() as database:
        await bootstrap_admin(database, "first-admin")

    async with session_factory() as database:
        try:
            await bootstrap_admin(database, "recovery-admin")
        except AdminBootstrapError as exc:
            assert "active admin already exists" in str(exc)
        else:
            raise AssertionError("bootstrap bypassed an existing active admin")

    async with session_factory() as database:
        first_admin = await database.scalar(
            select(User).where(User.username == "first-admin")
        )
        assert first_admin is not None
        first_admin.is_active = False
        await database.commit()

    async with session_factory() as database:
        recovered = await bootstrap_admin(database, "recovery-admin")
        assert recovered.role == "admin"


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
