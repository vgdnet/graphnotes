from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.db.session import get_db_session
from app.models.auth_session import AuthSession
from app.models.user import User, UserRole
from app.services.auth import hash_session_token, session_is_expired
from app.services.author_contract import AUTHOR_CONTRACT_REQUIRED
from app.services.session_cookie import session_cookie_deletion_header

DatabaseSession = Annotated[AsyncSession, Depends(get_db_session)]


async def get_current_user(
    database: DatabaseSession,
    session_token: Annotated[
        str | None,
        Cookie(alias=settings.session_cookie_name),
    ] = None,
) -> User:
    missing_credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="authentication required",
    )
    if not session_token:
        raise missing_credentials_error

    invalid_credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="authentication required",
        headers={"Set-Cookie": session_cookie_deletion_header()},
    )

    result = await database.execute(
        select(AuthSession)
        .options(joinedload(AuthSession.user))
        .where(AuthSession.token_hash == hash_session_token(session_token))
    )
    auth_session = result.scalar_one_or_none()
    if auth_session is None:
        raise invalid_credentials_error

    if session_is_expired(auth_session.expires_at):
        await database.delete(auth_session)
        await database.commit()
        raise invalid_credentials_error

    if not auth_session.user.is_active:
        await database.delete(auth_session)
        await database.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="account is inactive",
            headers={"Set-Cookie": session_cookie_deletion_header()},
        )

    return auth_session.user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_author(user: CurrentUser) -> User:
    if not user.is_author:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=AUTHOR_CONTRACT_REQUIRED,
        )
    return user


CurrentAuthor = Annotated[User, Depends(get_current_author)]


async def get_current_admin(user: CurrentUser) -> User:
    if user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="administrator access required",
        )
    return user


CurrentAdmin = Annotated[User, Depends(get_current_admin)]


async def get_current_editor(user: CurrentUser) -> User:
    if user.role not in {UserRole.EDITOR.value, UserRole.ADMIN.value}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="editor access required",
        )
    return user


CurrentEditor = Annotated[User, Depends(get_current_editor)]


async def get_optional_user(
    database: DatabaseSession,
    session_token: Annotated[
        str | None,
        Cookie(alias=settings.session_cookie_name),
    ] = None,
) -> User | None:
    if session_token is None:
        return None
    try:
        return await get_current_user(database, session_token)
    except HTTPException as exc:
        if exc.status_code in {
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        }:
            return None
        raise


OptionalUser = Annotated[User | None, Depends(get_optional_user)]
