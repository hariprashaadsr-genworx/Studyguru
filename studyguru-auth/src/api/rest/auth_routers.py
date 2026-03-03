import base64
import json
import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

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

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("studyguru.auth")


# ── POST /signup ──────────────────────────────────────────────────────────────

@router.post(
    "/signup",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account with email + password",
)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    if svc.get_user_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    user = svc.create_user(db, payload.name, payload.email, payload.password)
    tokens = svc.issue_token_pair(db, user)
    return TokenResponse(**tokens, user=UserOut.model_validate(user))


# ── POST /login ───────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email + password",
)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = svc.get_user_by_email(db, payload.email)

    _invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password.",
    )

    if not user or not user.hashed_password:
        raise _invalid
    if not svc.verify_password(payload.password, user.hashed_password):
        raise _invalid
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    tokens = svc.issue_token_pair(db, user)
    return TokenResponse(**tokens, user=UserOut.model_validate(user))


# ── POST /refresh ─────────────────────────────────────────────────────────────

@router.post(
    "/refresh",
    response_model=RefreshResponse,
    summary="Rotate refresh token and get a new access token",
)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    try:
        tokens = svc.refresh_token_pair(db, payload.refresh_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )
    return RefreshResponse(**tokens)


# ── POST /logout ──────────────────────────────────────────────────────────────

@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Revoke the current access token (and optionally the refresh token)",
)
def logout(
    payload: LogoutRequest,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from uuid import UUID

    svc.logout_user(
        db,
        access_jti=current["jti"],
        access_exp=current["exp"],
        refresh_token=payload.refresh_token,
        logout_all=payload.logout_all,
        user_id=UUID(current["user_id"]) if payload.logout_all else None,
    )
    return MessageResponse(message="Logged out successfully.")


# ── GET /me ───────────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserOut,
    summary="Return the authenticated user's profile",
)
def me(
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from uuid import UUID

    user = svc.get_user_by_id(db, UUID(current["user_id"]))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return UserOut.model_validate(user)


# ── GET /google ───────────────────────────────────────────────────────────────

@router.get("/google", summary="Start Google OAuth flow")
def google_login():
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

@router.get("/google/callback", summary="Google OAuth callback")
async def google_callback(code: str, db: Session = Depends(get_db)):
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
        user = svc.upsert_google_user(db, google_info)
    except Exception:
        logger.exception("DB error upserting Google user")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save Google user.",
        )

    tokens = svc.issue_token_pair(db, user)
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
