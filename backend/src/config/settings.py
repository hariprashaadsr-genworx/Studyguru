from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    OPENAI_API_KEY: str = ""
    TAVILY_API_KEY: str = ""
    POSTGRES_DSN: str = ""
    GROQ_API_KEY: str = ""
    YOUTUBE_API_KEY: str = ""


    class Config:
        env_file = ".env"
        extra    = "ignore"


settings = Settings()