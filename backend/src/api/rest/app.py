from pathlib import Path
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from src.api.rest.routes.base_generation_router import router
from fastapi import FastAPI
from src.data.clients.postgresql_client import init_db


load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print("[APP] Startup complete")
    yield
    print("[APP] Shutdown complete")

app = FastAPI(
    title="Course Engine v5",
    version="5.0.0",
    lifespan=lifespan,
)

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


app.include_router(router)


@app.get("/", response_class=HTMLResponse)
async def index():
    p = Path(__file__).parent / "static" / "index.html"
    if p.exists():
        return HTMLResponse(p.read_text())
    return HTMLResponse("<h1>index.html not found</h1>", 404)

