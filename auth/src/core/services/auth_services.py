import logging
import os
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from src.config.settings import settings
from src.core.auth.hash import hash_password, verify_password
from src.core.auth.jwt_handler import (
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
)
from src.core.auth.token_revocation import is_token_revoked, revoke_token
from src.data.models.auth_models import RevokedToken, User, UserSession

logger = logging.getLogger(__name__)


# ── User helpers ──────────────────────────────────────────────────────────────

def get_user_by_id(db: Session, user_id: UUID) -> Optional[User]:
    return db.get(User, user_id)


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.lower().strip()).first()


def create_user(db: Session, name: str, email: str, password: str) -> User:
    user = User(
        name=name.strip(),
        email=email.lower().strip(),
        hashed_password=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── Session helpers ───────────────────────────────────────────────────────────

def create_session(
    db: Session,
    user_id: UUID,
    refresh_token: str,
    refresh_jti: str,
    expires_at: datetime,
) -> UserSession:
    """Persist a new refresh-token session for *user_id*."""
    session = UserSession(
        user_id=user_id,
        refresh_token=refresh_token,
        refresh_jti=refresh_jti,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session_by_refresh_jti(db: Session, jti: str) -> Optional[UserSession]:
    return db.query(UserSession).filter(UserSession.refresh_jti == jti).first()


def delete_session_by_refresh_jti(db: Session, jti: str) -> None:
    db.query(UserSession).filter(UserSession.refresh_jti == jti).delete(
        synchronize_session=False
    )
    db.commit()


def delete_all_sessions_for_user(db: Session, user_id: UUID) -> None:
    """Logout everywhere – removes all active sessions."""
    db.query(UserSession).filter(UserSession.user_id == user_id).delete(
        synchronize_session=False
    )
    db.commit()


# ── Token-pair factory ────────────────────────────────────────────────────────

def issue_token_pair(db: Session, user: User) -> dict:
    """
    Create a fresh access + refresh token pair, persist the session,
    and return a dict ready to be serialised as a TokenResponse.
    """
    access_token, _access_jti, _access_exp = create_access_token(
        {"user_id": str(user.id)}
    )
    refresh_token, refresh_jti, refresh_exp = create_refresh_token(
        {"user_id": str(user.id)}
    )

    create_session(
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

def refresh_token_pair(db: Session, raw_refresh_token: str) -> dict:
    """
    Validate the incoming refresh token, rotate it, revoke the old one,
    and return a brand-new token pair.

    Raises ValueError with a user-friendly message on any failure.
    """
    payload = verify_refresh_token(raw_refresh_token)
    if payload is None:
        raise ValueError("Invalid or expired refresh token.")

    jti = payload.get("jti")
    exp = payload.get("exp")
    user_id_str = payload.get("user_id")

    if is_token_revoked(db, jti):
        raise ValueError("Refresh token has already been revoked.")

    session = get_session_by_refresh_jti(db, jti)
    if session is None:
        raise ValueError("Session not found. Please log in again.")

    if session.expires_at < datetime.now(timezone.utc):
        delete_session_by_refresh_jti(db, jti)
        raise ValueError("Refresh token has expired. Please log in again.")

    # Revoke the old refresh token & delete the old session
    revoke_token(db, jti=jti, expires_at=datetime.fromtimestamp(exp, tz=timezone.utc), token_type="refresh")
    delete_session_by_refresh_jti(db, jti)

    user = get_user_by_id(db, UUID(user_id_str))
    if user is None or not user.is_active:
        raise ValueError("User account not found or inactive.")

    return issue_token_pair(db, user)


# ── Logout ────────────────────────────────────────────────────────────────────

def logout_user(
    db: Session,
    access_jti: str,
    access_exp: int,
    refresh_token: Optional[str] = None,
    logout_all: bool = False,
    user_id: Optional[UUID] = None,
) -> None:
    """
    Revoke the current access token.
    Optionally also revoke the supplied refresh token / all sessions.
    """
    revoke_token(
        db,
        jti=access_jti,
        expires_at=datetime.fromtimestamp(access_exp, tz=timezone.utc),
        token_type="access",
    )

    if refresh_token:
        payload = verify_refresh_token(refresh_token)
        if payload:
            revoke_token(
                db,
                jti=payload["jti"],
                expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
                token_type="refresh",
            )
            delete_session_by_refresh_jti(db, payload["jti"])

    if logout_all and user_id:
        delete_all_sessions_for_user(db, user_id)


# ── Google OAuth helpers ──────────────────────────────────────────────────────

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


def upsert_google_user(db: Session, info: dict) -> User:
    google_id = info["id"]
    email = info["email"].lower()

    user = db.query(User).filter(User.google_id == google_id).first()
    if user:
        user.pic = info.get("picture")
        db.commit()
        db.refresh(user)
        return user

    user = get_user_by_email(db, email)
    if user:
        user.google_id = google_id
        user.pic = info.get("picture")
        db.commit()
        db.refresh(user)
        return user

    user = User(
        name=info.get("name", email.split("@")[0]),
        email=email,
        google_id=google_id,
        pic=info.get("picture"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
