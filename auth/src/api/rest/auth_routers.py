import base64
import json
import logging
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import settings
from src.core.auth.oauth_bearer import get_current_user
from src.core.services import auth_services as svc
from src.data.clients.db_client import get_db
from src.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshRequest,
    RefreshResponse,
    SignupRequest,
    TokenResponse,
    UserOut,
)

from src.core.auth.jwt_handler import verify_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("studyguru.auth")


# ── POST /signup ──────────────────────────────────────────────────────────────

@router.post(
    "/signup",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)):

    if await svc.get_user_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = await svc.create_user(
        db, payload.name, payload.email, payload.password
    )

    tokens = await svc.issue_token_pair(db, user)

    return TokenResponse(**tokens, user=UserOut.model_validate(user))


# ── POST /login ───────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):

    user = await svc.get_user_by_email(db, payload.email)

    _invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password.",
    )

    if not user or not user.hashed_password:
        raise _invalid

    if not await svc.verify_password(payload.password, user.hashed_password):
        raise _invalid

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    tokens = await svc.issue_token_pair(db, user)

    return TokenResponse(**tokens, user=UserOut.model_validate(user))


# ── POST /refresh ─────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=RefreshResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        tokens = await svc.refresh_token_pair(db, payload.refresh_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )

    return RefreshResponse(**tokens)


# ── POST /logout ──────────────────────────────────────────────────────────────

@router.post("/logout", response_model=MessageResponse)
async def logout(
    payload: LogoutRequest,
    current: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await svc.logout_user(
        db,
        access_jti=current["jti"],
        access_exp=current["exp"],
        refresh_token=payload.refresh_token,
        logout_all=payload.logout_all,
        user_id=UUID(current["user_id"]) if payload.logout_all else None,
    )

    return MessageResponse(message="Logged out successfully.")


# ── GET /me ───────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def me(
    current: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await svc.get_user_by_id(db, UUID(current["user_id"]))

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    return UserOut.model_validate(user)


# ── GET /google ───────────────────────────────────────────────────────────────

@router.get("/google")
async def google_login():
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured on this server.",
        )

    params = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "prompt": "select_account",
        }
    )

    return RedirectResponse(url=f"{settings.google_auth_url}?{params}")


# ── GET /google/callback ──────────────────────────────────────────────────────

@router.get("/google/callback")
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):

    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing authorisation code.",
        )

    try:
        google_info = await svc.google_exchange_code(code)
    except Exception as exc:
        logger.exception("Google token exchange failed")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google OAuth failed: {exc}",
        )

    try:
        user = await svc.upsert_google_user(db, google_info)
    except Exception:
        logger.exception("DB error upserting Google user")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save Google user.",
        )

    tokens = await svc.issue_token_pair(db, user)

    user_b64 = base64.b64encode(
        json.dumps(jsonable_encoder(UserOut.model_validate(user))).encode()
    ).decode()

    redirect_url = (
        f"{settings.frontend_origin}"
        f"?access_token={tokens['access_token']}"
        f"&refresh_token={tokens['refresh_token']}"
        f"&user={user_b64}"
    )

    return RedirectResponse(url=redirect_url)