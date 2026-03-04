import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import httpx
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import settings
from src.core.auth.hash import hash_password, verify_password
from src.core.auth.jwt_handler import (
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
)
from src.core.auth.token_revocation import is_token_revoked, revoke_token
from src.data.models.auth_models import User, UserSession

logger = logging.getLogger(__name__)


# ── User helpers ──────────────────────────────────────────────────────────────

async def get_user_by_id(db: AsyncSession, user_id: UUID) -> Optional[User]:
    return await db.get(User, user_id)


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(
        select(User).where(User.email == email.lower().strip())
    )
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    name: str,
    email: str,
    password: str,
) -> User:
    # Determine role: admin for hari@gmail.com, student for everyone else
    role = "admin" if email.lower().strip() == "hari@gmail.com" else "student"
    user = User(
        name=name.strip(),
        email=email.lower().strip(),
        hashed_password=await hash_password(password),
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ── Session helpers ───────────────────────────────────────────────────────────

async def create_session(
    db: AsyncSession,
    user_id: UUID,
    refresh_token: str,
    refresh_jti: str,
    expires_at: datetime,
) -> UserSession:
    session = UserSession(
        user_id=user_id,
        refresh_token=refresh_token,
        refresh_jti=refresh_jti,
        expires_at=expires_at,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def get_session_by_refresh_jti(
    db: AsyncSession, jti: str
) -> Optional[UserSession]:
    result = await db.execute(
        select(UserSession).where(UserSession.refresh_jti == jti)
    )
    return result.scalar_one_or_none()


async def delete_session_by_refresh_jti(db: AsyncSession, jti: str) -> None:
    await db.execute(
        delete(UserSession).where(UserSession.refresh_jti == jti)
    )
    await db.commit()


async def delete_all_sessions_for_user(
    db: AsyncSession, user_id: UUID
) -> None:
    await db.execute(
        delete(UserSession).where(UserSession.user_id == user_id)
    )
    await db.commit()


# ── Token-pair factory ────────────────────────────────────────────────────────

async def issue_token_pair(db: AsyncSession, user: User) -> dict:
    access_token, _, _ = await create_access_token(
        {"user_id": str(user.id), "role": user.role}
    )
    refresh_token, refresh_jti, refresh_exp = await create_refresh_token(
        {"user_id": str(user.id), "role": user.role}
    )

    await create_session(
        db,
        user_id=user.id,
        refresh_token=refresh_token,
        refresh_jti=refresh_jti,
        expires_at=refresh_exp,
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


# ── Refresh-token flow ────────────────────────────────────────────────────────

async def refresh_token_pair(
    db: AsyncSession,
    raw_refresh_token: str,
) -> dict:
    payload = await verify_refresh_token(raw_refresh_token)
    if payload is None:
        raise ValueError("Invalid or expired refresh token.")

    jti = payload.get("jti")
    exp = payload.get("exp")
    user_id_str = payload.get("user_id")

    if await is_token_revoked(db, jti):
        raise ValueError("Refresh token has already been revoked.")

    session = await get_session_by_refresh_jti(db, jti)
    if session is None:
        raise ValueError("Session not found. Please log in again.")

    if session.expires_at < datetime.now(timezone.utc):
        await delete_session_by_refresh_jti(db, jti)
        raise ValueError("Refresh token has expired. Please log in again.")

    await revoke_token(
        db,
        jti=jti,
        expires_at=datetime.fromtimestamp(exp, tz=timezone.utc),
        token_type="refresh",
    )

    await delete_session_by_refresh_jti(db, jti)

    user = await get_user_by_id(db, UUID(user_id_str))
    if user is None or not user.is_active:
        raise ValueError("User account not found or inactive.")

    return await issue_token_pair(db, user)


# ── Logout ────────────────────────────────────────────────────────────────────

async def logout_user(
    db: AsyncSession,
    access_jti: str,
    access_exp: int,
    refresh_token: Optional[str] = None,
    logout_all: bool = False,
    user_id: Optional[UUID] = None,
) -> None:
    await revoke_token(
        db,
        jti=access_jti,
        expires_at=datetime.fromtimestamp(access_exp, tz=timezone.utc),
        token_type="access",
    )

    if refresh_token:
        payload = await verify_refresh_token(refresh_token)
        if payload:
            await revoke_token(
                db,
                jti=payload["jti"],
                expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
                token_type="refresh",
            )
            await delete_session_by_refresh_jti(db, payload["jti"])

    if logout_all and user_id:
        await delete_all_sessions_for_user(db, user_id)


# ── Google OAuth upsert ───────────────────────────────────────────────────────

async def google_exchange_code(code: str) -> dict:
    """Trade an OAuth authorisation code for Google user-info."""
    async with httpx.AsyncClient(timeout=10) as client:
        token_res = await client.post(
            settings.google_token_url,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_res.raise_for_status()
        tokens = token_res.json()

        info_res = await client.get(
            settings.google_userinfo_url,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        info_res.raise_for_status()
        return info_res.json()
    


async def upsert_google_user(db: AsyncSession, info: dict) -> User:
    google_id = info["id"]
    email = info["email"].lower()

    result = await db.execute(
        select(User).where(User.google_id == google_id)
    )
    user = result.scalar_one_or_none()

    if user:
        user.pic = info.get("picture")
        await db.commit()
        await db.refresh(user)
        return user

    user = await get_user_by_email(db, email)
    if user:
        user.google_id = google_id
        user.pic = info.get("picture")
        await db.commit()
        await db.refresh(user)
        return user

    user = User(
        name=info.get("name", email.split("@")[0]),
        email=email,
        google_id=google_id,
        pic=info.get("picture"),
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user