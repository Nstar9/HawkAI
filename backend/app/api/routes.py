import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.schemas.entity import Entity
from app.schemas.investigation import Investigation, InvestigationCreate
from app.services.investigation_service import get_investigation_service
from app.services.mongodb_service import get_mongodb_service

router = APIRouter()


class NoteCreate(BaseModel):
    author: str = Field(default="analyst", max_length=120)
    content: str = Field(..., min_length=1, max_length=5000)


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "hawkai-api"}


# --- Investigations ---


@router.post("/investigations", response_model=Investigation, status_code=202)
async def create_investigation(payload: InvestigationCreate) -> Investigation:
    return await get_investigation_service().create(payload)


@router.get("/investigations", response_model=list[Investigation])
async def list_investigations(limit: int = 50) -> list[Investigation]:
    return await get_investigation_service().list_recent(limit)


@router.get("/investigations/{investigation_id}", response_model=Investigation)
async def get_investigation(investigation_id: str) -> Investigation:
    investigation = await get_investigation_service().get(investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return investigation


@router.get("/investigations/{investigation_id}/stream")
async def stream_investigation(investigation_id: str) -> EventSourceResponse:
    service = get_investigation_service()

    async def event_generator():
        async for item in service.stream_events(investigation_id):
            yield {
                "event": item.get("event", "message"),
                "data": json.dumps(item.get("data", {})),
            }

    return EventSourceResponse(event_generator())


# --- Entities ---


@router.get("/entities", response_model=list[Entity])
async def list_entities(limit: int = 50) -> list[Entity]:
    return await get_mongodb_service().list_entities(limit)


@router.get("/entities/{entity_id}", response_model=Entity)
async def get_entity(entity_id: str) -> Entity:
    entity = await get_mongodb_service().get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    return entity


@router.post("/entities/{entity_id}/notes", response_model=Entity)
async def add_entity_note(entity_id: str, payload: NoteCreate) -> Entity:
    entity = await get_mongodb_service().add_entity_note(
        entity_id,
        author=payload.author,
        content=payload.content,
    )
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    return entity
