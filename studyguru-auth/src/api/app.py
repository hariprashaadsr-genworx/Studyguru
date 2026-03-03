import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.rest.auth_routers import router as auth_router
from src.config.settings import settings
from src.data.clients.db_client import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
)
logger = logging.getLogger("studyguru.auth")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────
    init_db()
    logger.info("✓ StudyGuru Auth DB initialised (tables: users, sessions, revoked_tokens)")
    logger.info("✓ Frontend origin  →  %s", settings.frontend_origin)
    logger.info(
        "✓ Google OAuth     →  %s",
        "configured" if settings.google_client_id else "NOT configured (email/password only)",
    )
    yield
    # ── Shutdown (nothing to clean up for sync SQLAlchemy) ─────────────────


app = FastAPI(
    title="StudyGuru Auth API",
    version="1.0.0",
    description="Authentication service for StudyGuru – signup, login, refresh, logout, Google OAuth.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.get("/api/health", tags=["health"], summary="Healthcheck")
def health():
    return {"status": "ok", "service": "studyguru-auth", "version": "1.0.0"}
