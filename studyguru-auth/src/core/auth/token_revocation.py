from datetime import datetime, timezone

from sqlalchemy.orm import Session

from src.data.models.auth_models import RevokedToken


def revoke_token(db: Session, jti: str, expires_at: datetime, token_type: str = "access") -> None:
    """Insert a JTI into the revoked_tokens table."""
    if isinstance(expires_at, (int, float)):
        expires_at = datetime.fromtimestamp(expires_at, tz=timezone.utc)
    elif expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    entry = RevokedToken(jti=jti, expires_at=expires_at, token_type=token_type)
    db.add(entry)
    db.commit()


def is_token_revoked(db: Session, jti: str) -> bool:
    """Return True if *jti* is in the revoked list (and has not yet expired)."""
    now = datetime.now(timezone.utc)
    entry: RevokedToken | None = (
        db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
    )
    if entry is None:
        return False
    if entry.expires_at < now:
        # Stale entry – clean it up and treat as valid
        db.delete(entry)
        db.commit()
        return False
    return True


def purge_expired_revocations(db: Session) -> int:
    """Delete all expired revocation entries. Returns number of rows deleted."""
    now = datetime.now(timezone.utc)
    deleted = (
        db.query(RevokedToken)
        .filter(RevokedToken.expires_at < now)
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted
