import uvicorn


def run() -> None:
    uvicorn.run(
        "src.api.rest.app:app", 
        host="0.0.0.0",
        port=8000,
        factory=False,
    )


if __name__ == "__main__":
    run()