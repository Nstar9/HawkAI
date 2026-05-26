from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "hawkai"
    debug: bool = False

    google_api_key: str = ""
    google_genai_use_vertexai: bool = False
    google_cloud_project: str = ""
    google_cloud_location: str = "us-central1"
    gemini_model: str = "gemini-2.0-flash-lite"
    embedding_model: str = "gemini-embedding-001"
    embedding_dims: int = 768

    mongodb_uri: str = "mongodb://mongodb:27017"
    mongodb_database: str = "hawkai"

    mcp_read_only: bool = False
    cors_origins: list[str] = ["http://localhost:3000"]

    vector_search_limit: int = 10
    watchlist_seed_path: str = "data/watchlist_seeds.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
