import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import DatabaseSession
from app.core.config import settings
from app.models.auth_session import AuthSession
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse
from app.services.audit import record_audit_event
from app.services.author_contract import apply_accept
from app.services.auth import (
    DUMMY_PASSWORD_HASH,
    hash_password,
    hash_session_token,
    new_auth_session,
    session_is_expired,
    verify_password,
)
from app.services.session_cookie import (
    clear_session_cookie,
    session_cookie_deletion_header,
    set_session_cookie,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: RegisterRequest,
    response: Response,
    database: DatabaseSession,
) -> User:
    password_hash = await run_in_threadpool(hash_password, payload.password)
    taken_email = await database.scalar(select(User.id).where(User.email == payload.email))
    if taken_email is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email is already registered",
        )
    user = User(
        username=payload.username,
        password_hash=password_hash,
        email=payload.email,
        display_name=payload.display_name,
    )
    if payload.accept_author_contract:
        apply_accept(user)
    database.add(user)

    try:
        await database.flush()
        record_audit_event(
            database,
            action="auth.registration_succeeded",
            actor_user_id=user.id,
            target_user_id=user.id,
            subject_username=user.username,
        )
        if payload.accept_author_contract:
            record_audit_event(
                database,
                action="author.contract_accepted",
                actor_user_id=user.id,
                target_user_id=user.id,
                subject_username=user.username,
                details={"version": user.author_contract_version},
            )
        auth_session, token = new_auth_session(user.id)
        database.add(auth_session)
        await database.commit()
        await database.refresh(user)
    except IntegrityError as exc:
        await database.rollback()
        record_audit_event(
            database,
            action="auth.registration_failed",
            subject_username=payload.username,
            details={"reason": "identity_conflict"},
        )
        await database.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="username is already registered",
        ) from exc

    set_session_cookie(response, token)
    return user


@router.post("/login", response_model=UserResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    database: DatabaseSession,
) -> User:
    result = await database.execute(
        select(User).where(User.username == payload.username)
    )
    user = result.scalar_one_or_none()
    password_valid = await run_in_threadpool(
        verify_password,
        user.password_hash if user is not None else DUMMY_PASSWORD_HASH,
        payload.password,
    )

    if user is None or not password_valid:
        record_audit_event(
            database,
            action="auth.login_failed",
            target_user_id=user.id if user is not None else None,
            subject_username=payload.username,
            details={"reason": "invalid_credentials"},
        )
        await database.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid username or password",
        )
    if not user.is_active:
        record_audit_event(
            database,
            action="auth.login_failed",
            target_user_id=user.id,
            subject_username=user.username,
            details={"reason": "inactive_account"},
        )
        await database.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="account is inactive",
        )

    auth_session, token = new_auth_session(user.id)
    database.add(auth_session)
    record_audit_event(
        database,
        action="auth.login_succeeded",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
    )
    await database.commit()
    set_session_cookie(response, token)
    return user


@router.post("/refresh", response_model=UserResponse)
async def refresh_session(
    response: Response,
    database: DatabaseSession,
    session_token: Annotated[
        str | None,
        Cookie(alias=settings.session_cookie_name),
    ] = None,
) -> User:
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
        )

    result = await database.execute(
        select(AuthSession)
        .options(joinedload(AuthSession.user))
        .where(AuthSession.token_hash == hash_session_token(session_token))
    )
    auth_session = result.scalar_one_or_none()
    if auth_session is None or session_is_expired(auth_session.expires_at):
        if auth_session is not None:
            await database.delete(auth_session)
            await database.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
            headers={"Set-Cookie": session_cookie_deletion_header()},
        )
    if not auth_session.user.is_active:
        await database.delete(auth_session)
        await database.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="account is inactive",
            headers={"Set-Cookie": session_cookie_deletion_header()},
        )

    token = secrets.token_urlsafe(32)
    auth_session.token_hash = hash_session_token(token)
    auth_session.expires_at = datetime.now(UTC) + timedelta(
        hours=settings.session_ttl_hours
    )
    await database.commit()
    set_session_cookie(response, token)
    return auth_session.user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    database: DatabaseSession,
    session_token: Annotated[
        str | None,
        Cookie(alias=settings.session_cookie_name),
    ] = None,
) -> None:
    if session_token:
        result = await database.execute(
            select(AuthSession).where(
                AuthSession.token_hash == hash_session_token(session_token)
            )
        )
        auth_session = result.scalar_one_or_none()
        if auth_session is not None:
            record_audit_event(
                database,
                action="auth.logout",
                actor_user_id=auth_session.user_id,
                target_user_id=auth_session.user_id,
            )
            await database.delete(auth_session)
            await database.commit()

    clear_session_cookie(response)
