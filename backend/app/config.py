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

    # Agent model — used for ResearchAgent and IntelligenceAgent orchestration.
    # gemini-2.5-flash: fast, capable, ideal for tool-calling agents.
    gemini_model: str = "gemini-2.5-flash"

    # Synthesis model — used for the two most important tool calls:
    # classify_and_store_signals and synthesize_risk_report.
    # gemini-2.5-pro delivers the highest-quality structured output.
    # Set equal to gemini_model to reduce cost if needed.
    synthesis_model: str = "gemini-2.5-pro"

    embedding_model: str = "gemini-embedding-001"
    embedding_dims: int = 768

    # Fallback mode when Google Search grounding quota is exhausted.
    # The pipeline continues using model knowledge — disable for live search.
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
