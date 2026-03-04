from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from src.config.settings import settings

DATABASE_URL = settings.database_url

engine = create_async_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

SessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
)

Base = declarative_base()


# ── FastAPI Dependency ────────────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency – yields an async DB session."""
    async with SessionLocal() as session:
        yield session


# ── DB Initialisation ─────────────────────────────────────────────────────────

async def init_db() -> None:
    """Create all tables that are not yet present in the database."""
    import src.data.models.auth_models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed admin user
    await _seed_admin()


async def _seed_admin() -> None:
    """Ensure the admin user hari@gmail.com exists."""
    from src.data.models.auth_models import User
    from src.core.auth.hash import hash_password
    from sqlalchemy import select

    async with SessionLocal() as session:
        result = await session.execute(
            select(User).where(User.email == "hari@gmail.com")
        )
        admin = result.scalar_one_or_none()
        if not admin:
            admin = User(
                name="Hari",
                email="hari@gmail.com",
                hashed_password=await hash_password("harihari"),
                role="admin",
            )
            session.add(admin)
            await session.commit()