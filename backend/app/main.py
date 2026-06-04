import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import get_settings
from app.services.mongodb_service import get_mongodb_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()

    if settings.google_api_key:
        os.environ.setdefault("GOOGLE_API_KEY", settings.google_api_key)
    if settings.google_genai_use_vertexai:
        os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
        if settings.google_cloud_project:
            os.environ.setdefault("GOOGLE_CLOUD_PROJECT", settings.google_cloud_project)
        if settings.google_cloud_location:
            os.environ.setdefault("GOOGLE_CLOUD_LOCATION", settings.google_cloud_location)

    logger.info(
        "HawkAI starting — model=%s search=%s db=%s",
        settings.gemini_model,
        "disabled" if settings.disable_google_search else "live",
        settings.mongodb_database,
    )

    await get_mongodb_service().connect()
    yield
    await get_mongodb_service().disconnect()


def create_app() -> FastAPI:
    application = FastAPI(
        title="HawkAI",
        description=(
            "Autonomous KYC/AML intelligence — researches companies, people, and funds "
            "and produces structured financial crime risk reports in under 90 seconds."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(router, prefix="/api/v1")
    return application


app = create_app()
