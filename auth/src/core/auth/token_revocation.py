from datetime import datetime, timezone

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.data.models.auth_models import RevokedToken


async def revoke_token(
    db: AsyncSession,
    jti: str,
    expires_at: datetime,
    token_type: str = "access",
) -> None:
    """Insert a JTI into the revoked_tokens table."""
    if isinstance(expires_at, (int, float)):
        expires_at = datetime.fromtimestamp(expires_at, tz=timezone.utc)
    elif expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    entry = RevokedToken(
        jti=jti,
        expires_at=expires_at,
        token_type=token_type,
    )

    db.add(entry)
    await db.commit()


async def is_token_revoked(db: AsyncSession, jti: str) -> bool:
    """Return True if *jti* is in the revoked list (and has not yet expired)."""
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(RevokedToken).where(RevokedToken.jti == jti)
    )
    entry: RevokedToken | None = result.scalar_one_or_none()

    if entry is None:
        return False

    if entry.expires_at < now:
        await db.delete(entry)
        await db.commit()
        return False

    return True


async def purge_expired_revocations(db: AsyncSession) -> int:
    """Delete all expired revocation entries. Returns number of rows deleted."""
    now = datetime.now(timezone.utc)

    result = await db.execute(
        delete(RevokedToken).where(RevokedToken.expires_at < now)
    )

    await db.commit()

    # result.rowcount may be None depending on driver
    return result.rowcount or 0