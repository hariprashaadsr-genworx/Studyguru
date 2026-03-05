from typing import AsyncGenerator
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from src.config.settings import settings

DATABASE_URL = settings.POSTGRES_DSN

if not DATABASE_URL:
    raise RuntimeError("POSTGRES_DSN is not set")


Base = declarative_base()

engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
)


async def init_db() -> None:
    """
    Called at FastAPI startup
    """
    # Import all models so Base.metadata picks them up
    import src.data.models.postgres.course       # noqa: F401
    import src.data.models.postgres.submodules    # noqa: F401
    import src.data.models.postgres.custom_course # noqa: F401
    import src.data.models.postgres.enrollment    # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency
    """
    async with SessionLocal() as session:
        yield session