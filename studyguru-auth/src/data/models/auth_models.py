import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.orm import relationship

from src.data.clients.db_client import Base


# ── Portable UUID column (works with SQLite + PostgreSQL) ─────────────────────
class GUID(TypeDecorator):
    """Store UUIDs as CHAR(36) on SQLite, native UUID on PostgreSQL."""

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID())
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return str(value)
        return str(value) if isinstance(value, uuid.UUID) else value

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        return uuid.UUID(str(value))


def _now():
    return datetime.now(timezone.utc)


# ─────────────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(GUID, primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(254), unique=True, nullable=False, index=True)
    hashed_password = Column(Text, nullable=True)   # null for OAuth-only users
    google_id = Column(String(128), unique=True, nullable=True, index=True)
    pic = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    sessions = relationship(
        "UserSession", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<User id={self.id} email={self.email}>"


# ─────────────────────────────────────────────────────────────────────────────
# Sessions  (one row per active refresh-token)
# ─────────────────────────────────────────────────────────────────────────────
class UserSession(Base):
    __tablename__ = "sessions"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # JTI of the refresh token stored here so logout can revoke it
    refresh_jti = Column(String(36), unique=True, nullable=False, index=True)
    refresh_token = Column(Text, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    user = relationship("User", back_populates="sessions")

    def __repr__(self):
        return f"<UserSession id={self.id} user_id={self.user_id}>"


# ─────────────────────────────────────────────────────────────────────────────
# Revoked tokens  (access-token JTIs that were explicitly revoked)
# ─────────────────────────────────────────────────────────────────────────────
class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    jti = Column(String(36), unique=True, nullable=False, index=True)
    token_type = Column(String(10), nullable=False, default="access")  # "access" | "refresh"
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    def __repr__(self):
        return f"<RevokedToken jti={self.jti}>"
