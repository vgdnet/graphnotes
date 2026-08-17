from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.db.session import get_db_session
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.auth import hash_session_token, session_is_expired

DatabaseSession = Annotated[AsyncSession, Depends(get_db_session)]


async def get_current_user(
    database: DatabaseSession,
    session_token: Annotated[
        str | None,
        Cookie(alias=settings.session_cookie_name),
    ] = None,
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="authentication required",
    )
    if not session_token:
        raise credentials_error

    result = await database.execute(
        select(AuthSession)
        .options(joinedload(AuthSession.user))
        .where(AuthSession.token_hash == hash_session_token(session_token))
    )
    auth_session = result.scalar_one_or_none()
    if auth_session is None:
        raise credentials_error

    if session_is_expired(auth_session.expires_at):
        await database.delete(auth_session)
        await database.commit()
        raise credentials_error

    if not auth_session.user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="account is inactive",
        )

    return auth_session.user


CurrentUser = Annotated[User, Depends(get_current_user)]
