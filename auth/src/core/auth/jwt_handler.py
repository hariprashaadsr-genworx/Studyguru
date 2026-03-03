import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from src.config.settings import settings

ACCESS_SECRET = settings.secret_key
REFRESH_SECRET = settings.refresh_secret_key
ALGORITHM = settings.algorithm
ACCESS_EXPIRE_MIN = settings.access_token_expire_minutes
REFRESH_EXPIRE_DAYS = settings.refresh_token_expire_days


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_jti() -> str:
    return str(uuid.uuid4())


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ── Access token ──────────────────────────────────────────────────────────────

def create_access_token(data: dict) -> tuple[str, str, datetime]:
    """
    Returns (token, jti, expires_at).
    `data` must contain at least {"user_id": "<uuid-str>"}.
    """
    jti = _make_jti()
    expires_at = _utc_now() + timedelta(minutes=ACCESS_EXPIRE_MIN)
    payload = {**data, "type": "access", "jti": jti, "exp": expires_at}
    token = jwt.encode(payload, ACCESS_SECRET, algorithm=ALGORITHM)
    return token, jti, expires_at


def verify_access_token(token: str) -> dict | None:
    """Return decoded payload or None if invalid / expired / wrong type."""
    try:
        payload = jwt.decode(token, ACCESS_SECRET, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


# ── Refresh token ─────────────────────────────────────────────────────────────

def create_refresh_token(data: dict) -> tuple[str, str, datetime]:
    """
    Returns (token, jti, expires_at).
    Uses a separate secret so a leaked access secret can't forge refresh tokens.
    """
    jti = _make_jti()
    expires_at = _utc_now() + timedelta(days=REFRESH_EXPIRE_DAYS)
    payload = {**data, "type": "refresh", "jti": jti, "exp": expires_at}
    token = jwt.encode(payload, REFRESH_SECRET, algorithm=ALGORITHM)
    return token, jti, expires_at


def verify_refresh_token(token: str) -> dict | None:
    """Return decoded payload or None if invalid / expired / wrong type."""
    try:
        payload = jwt.decode(token, REFRESH_SECRET, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None
