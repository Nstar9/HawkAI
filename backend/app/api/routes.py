import json
import os
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
async def health() -> dict[str, Any]:
    from app.config import get_settings
    settings = get_settings()
    return {
        "status": "ok",
        "service": "hawkai-api",
        "version": "1.0.0",
        "model": settings.gemini_model,
        "synthesis_model": settings.synthesis_model,
        "search": "disabled" if settings.disable_google_search else "live",
    }


# ---------------------------------------------------------------------------
# Investigations
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------


@router.delete("/investigations/failed")
async def delete_failed_investigations() -> dict[str, int]:
    """Delete all failed investigations to keep the dossier list clean."""
    db = get_mongodb_service()
    result = await db.db["investigations"].delete_many({"status": "failed"})
    return {"deleted": result.deleted_count}


@router.delete("/investigations/{investigation_id}")
async def delete_investigation(investigation_id: str) -> dict[str, str]:
    """Delete a specific investigation and its associated risk signals."""
    db = get_mongodb_service()
    inv = await db.get_investigation(investigation_id)
    if inv is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    await db.db["investigations"].delete_one({"_id": investigation_id})
    await db.db["risk_signals"].delete_many({"investigation_id": investigation_id})
    return {"deleted": investigation_id}


# ---------------------------------------------------------------------------
# Watchlists — expose the internal watchlist patterns used in classification
# ---------------------------------------------------------------------------


@router.get("/watchlists")
async def get_watchlists() -> list[dict[str, Any]]:
    """Return the watchlist patterns used by the signal classification engine."""
    from app.config import get_settings
    path = get_settings().watchlist_seed_path
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return []


# ---------------------------------------------------------------------------
# Signals — aggregate risk signals across all investigations
# ---------------------------------------------------------------------------


@router.get("/signals")
async def list_all_signals(limit: int = 200) -> list[dict[str, Any]]:
    """Return all risk signals across all investigations, newest first."""
    db = get_mongodb_service()
    investigations = await db.list_investigations(50)
    signals = []
    for inv in investigations:
        if inv.result and inv.result.signals:
            for sig in inv.result.signals:
                signals.append({
                    **sig.model_dump(mode="json"),
                    "entity_name": inv.entity_name,
                    "investigation_id": inv.id,
                    "investigation_status": inv.status.value,
                })
    # Sort by severity then confidence
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    signals.sort(key=lambda s: (sev_order.get(s.get("severity", "low"), 4), -s.get("confidence", 0)))
    return signals[:limit]
