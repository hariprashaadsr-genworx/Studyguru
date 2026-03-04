import uvicorn
from src.config.settings import settings

def run() -> None:
    uvicorn.run(
        "src.api.app:app",
        host="0.0.0.0",
        port=8001,
        reload=False,
    )


if __name__ == "__main__":
    run()
