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
from app.schemas.auth import (
    EmailRequest,
    EmailVerifyRequest,
    LoginRequest,
    MailStatusResponse,
    RegisterRequest,
    UserResponse,
)
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
from app.services.mail import (
    CONFIRM_PURPOSE,
    LOGIN_PURPOSE,
    MailDeliveryError,
    MailNotConfiguredError,
    confirmation_mail,
    consume_email_token,
    issue_email_token,
    login_mail,
    send_plaintext_mail,
    smtp_configured,
)
from app.services.session_cookie import (
    clear_session_cookie,
    session_cookie_deletion_header,
    set_session_cookie,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


def _mark_login(user: User) -> None:
    user.last_login_at = datetime.now(UTC)


async def _open_session(database, user: User) -> str:
    _mark_login(user)
    auth_session, token = new_auth_session(user.id)
    database.add(auth_session)
    return token


async def _send_user_mail(user: User, purpose: str, token: str, code: str) -> None:
    if purpose == LOGIN_PURPOSE:
        subject, body = login_mail(user, token, code)
    else:
        subject, body = confirmation_mail(user, token, code)
    await run_in_threadpool(
        send_plaintext_mail,
        to_address=user.email,
        subject=subject,
        body=body,
    )


async def _lookup_login_user(database, identifier: str) -> User | None:
    if "@" in identifier:
        return await database.scalar(select(User).where(User.email == identifier))
    return await database.scalar(select(User).where(User.username == identifier))


@router.get("/mail-status", response_model=MailStatusResponse)
async def mail_status() -> MailStatusResponse:
    return MailStatusResponse(configured=smtp_configured())


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
    now = datetime.now(UTC)
    user = User(
        username=payload.username,
        password_hash=password_hash,
        email=payload.email,
        display_name=payload.display_name,
        email_verified_at=None if smtp_configured() else now,
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
        if smtp_configured():
            token, code = await issue_email_token(database, user, CONFIRM_PURPOSE)
            try:
                await _send_user_mail(user, CONFIRM_PURPOSE, token, code)
            except (MailNotConfiguredError, MailDeliveryError) as exc:
                await database.rollback()
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="confirmation mail could not be sent",
                ) from exc
            record_audit_event(
                database,
                action="mail.confirmation_sent",
                actor_user_id=user.id,
                target_user_id=user.id,
                subject_username=user.username,
                details={"purpose": CONFIRM_PURPOSE},
            )
            await database.commit()
            await database.refresh(user)
            return user

        token = await _open_session(database, user)
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
    user = await _lookup_login_user(database, payload.username)
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
            subject_username=payload.username[:32],
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
    if smtp_configured() and user.email_verified_at is None:
        record_audit_event(
            database,
            action="auth.login_failed",
            target_user_id=user.id,
            subject_username=user.username,
            details={"reason": "email_not_confirmed"},
        )
        await database.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="email is not confirmed",
        )

    token = await _open_session(database, user)
    record_audit_event(
        database,
        action="auth.login_succeeded",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={"method": "password"},
    )
    await database.commit()
    await database.refresh(user)
    set_session_cookie(response, token)
    return user


@router.post("/email/request", status_code=status.HTTP_204_NO_CONTENT)
async def request_email_code(
    payload: EmailRequest,
    database: DatabaseSession,
) -> None:
    if not smtp_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP is not configured",
        )
    user = await database.scalar(select(User).where(User.email == payload.email))
    if user is None or not user.is_active:
        return
    if payload.purpose == LOGIN_PURPOSE and user.email_verified_at is None:
        return
    token, code = await issue_email_token(database, user, payload.purpose)
    try:
        await _send_user_mail(user, payload.purpose, token, code)
    except (MailNotConfiguredError, MailDeliveryError) as exc:
        await database.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="mail could not be sent",
        ) from exc
    record_audit_event(
        database,
        action="mail.code_sent",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={"purpose": payload.purpose},
    )
    await database.commit()


@router.post("/email/verify", response_model=UserResponse)
async def verify_email_code(
    payload: EmailVerifyRequest,
    response: Response,
    database: DatabaseSession,
) -> User:
    if not smtp_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP is not configured",
        )
    user = await consume_email_token(
        database,
        purpose=payload.purpose,
        token=payload.token,
        code=payload.code,
        email=payload.email,
    )
    if user is None:
        record_audit_event(
            database,
            action="auth.login_failed",
            subject_username=(payload.email or "")[:32] or None,
            details={"reason": "invalid_email_code"},
        )
        await database.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired email code",
        )
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(UTC)
        record_audit_event(
            database,
            action="auth.email_confirmed",
            actor_user_id=user.id,
            target_user_id=user.id,
            subject_username=user.username,
        )
    token = await _open_session(database, user)
    record_audit_event(
        database,
        action="auth.login_succeeded",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={"method": "email_code"},
    )
    await database.commit()
    await database.refresh(user)
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
