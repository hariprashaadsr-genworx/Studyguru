from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # JWT
    secret_key: str = "change-me"
    refresh_secret_key: str = "change-me-refresh"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""
    google_auth_url: str = ""
    google_token_url: str = ""
    google_userinfo_url: str = ""

    # App
    frontend_origin: str = "http://localhost:5173"
    database_url: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
