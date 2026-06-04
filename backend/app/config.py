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

    # --- Google AI ---
    google_api_key: str = ""
    google_genai_use_vertexai: bool = False
    google_cloud_project: str = ""
    google_cloud_location: str = "us-central1"

    # Model — paid tier: gemini-2.0-flash (fast, cheap, reliable)
    # Free tier fallback: gemini-3.5-flash
    gemini_model: str = "gemini-2.0-flash"
    embedding_model: str = "gemini-embedding-001"
    embedding_dims: int = 768

    # Set to true only if Google Search grounding quota is exhausted.
    # The pipeline still runs using model knowledge when disabled.
    disable_google_search: bool = False

    # --- MongoDB ---
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "hawkai"

    # --- API ---
    cors_origins: list[str] = ["*"]
    vector_search_limit: int = 10
    watchlist_seed_path: str = "data/watchlist_seeds.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
