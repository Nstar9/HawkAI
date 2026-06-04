"""Investigation orchestration service.

Manages the full lifecycle of a HawkAI investigation:
  1. Creates a pending investigation record in MongoDB
  2. Spawns a background asyncio task that runs the ADK agent pipeline
  3. Publishes SSE events to all connected subscribers in real-time
  4. Handles timeouts, quota errors, and transient failures gracefully
"""

import asyncio
import logging
import re
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any, AsyncGenerator

from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types

from app.config import get_settings
from app.schemas.investigation import (
    Investigation,
    InvestigationCreate,
    InvestigationStatus,
    InvestigationStep,
    InvestigationStepName,
)
from app.services.mongodb_service import get_mongodb_service

logger = logging.getLogger(__name__)

# Human-readable step messages keyed by IntelligenceAgent tool name
_TOOL_STEP_MESSAGES: dict[str, str] = {
    "extract_and_store_entity": "Extracting and storing entity profile…",
    "run_vector_similarity_search": "Running vector similarity search…",
    "find_correlated_entities": "Running MongoDB correlation queries…",
    "classify_and_store_signals": "Classifying risk signals…",
    "synthesize_risk_report": "Synthesizing final risk report…",
}

# Hard timeout for the entire pipeline (research + intelligence)
_PIPELINE_TIMEOUT_SECONDS = 600.0


def _user_friendly_error(raw: str) -> str:
    """Convert raw exception text into a short, user-friendly message."""
    if "RESOURCE_EXHAUSTED" in raw or "429" in raw:
        return (
            "Gemini API quota reached. The pipeline will auto-retry shortly. "
            "If this persists, the daily free-tier limit has been hit — "
            "please check Google AI Studio quota or try again tomorrow."
        )
    if "UNAVAILABLE" in raw or "503" in raw or "high demand" in raw.lower():
        return "Gemini API is temporarily overloaded. Please retry in a moment."
    if "timed out" in raw.lower():
        return (
            "Investigation timed out — the pipeline exceeded the 10-minute limit. "
            "This is usually caused by slow model responses. Please try again."
        )
    if "Context variable not found" in raw:
        return "Internal agent context error. Please retry the investigation."
    # Generic fallback — never expose raw stack traces to the frontend
    return "Investigation failed due to an unexpected error. Please try again."


class InvestigationService:
    """Singleton service that owns the ADK Runner and pub/sub event bus."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._app_name = self._settings.app_name
        self._session_service = InMemorySessionService()
        self._subscribers: dict[str, list[asyncio.Queue[dict[str, Any]]]] = defaultdict(list)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def create(self, payload: InvestigationCreate) -> Investigation:
        db = get_mongodb_service()
        investigation = await db.create_investigation(payload)
        asyncio.create_task(self._run_pipeline(investigation.id))
        return investigation

    async def get(self, investigation_id: str) -> Investigation | None:
        return await get_mongodb_service().get_investigation(investigation_id)

    async def list_recent(self, limit: int = 50) -> list[Investigation]:
        return await get_mongodb_service().list_investigations(limit)

    # ------------------------------------------------------------------
    # SSE pub/sub
    # ------------------------------------------------------------------

    def subscribe(self, investigation_id: str) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers[investigation_id].append(q)
        return q

    def unsubscribe(self, investigation_id: str, q: asyncio.Queue[dict[str, Any]]) -> None:
        subs = self._subscribers.get(investigation_id, [])
        if q in subs:
            subs.remove(q)

    async def stream_events(
        self, investigation_id: str
    ) -> AsyncGenerator[dict[str, Any], None]:
        investigation = await self.get(investigation_id)
        if investigation is None:
            yield {"event": "error", "data": {"message": "Investigation not found."}}
            return

        yield {"event": "snapshot", "data": investigation.model_dump(mode="json")}

        # Already terminal — send final state and close immediately
        if investigation.status in (InvestigationStatus.COMPLETED, InvestigationStatus.FAILED):
            yield {"event": "done", "data": {"status": investigation.status.value}}
            return

        q = self.subscribe(investigation_id)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=660.0)
                except asyncio.TimeoutError:
                    yield {
                        "event": "error",
                        "data": {"message": "Stream timed out — no events for 11 minutes."},
                    }
                    break
                yield event
                if event.get("event") in ("done", "error"):
                    break
        finally:
            self.unsubscribe(investigation_id, q)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _publish(self, investigation_id: str, event: str, data: dict[str, Any]) -> None:
        payload = {"event": event, "data": data}
        for q in self._subscribers.get(investigation_id, []):
            await q.put(payload)

    async def _set_step(
        self,
        investigation_id: str,
        name: InvestigationStepName,
        status: InvestigationStatus,
        message: str,
    ) -> None:
        db = get_mongodb_service()
        investigation = await db.get_investigation(investigation_id)
        if investigation is None:
            return

        now = datetime.now(UTC)
        steps = list(investigation.steps)
        existing = next((s for s in steps if s.name == name), None)

        if existing:
            existing.status = status
            existing.message = message
            if status == InvestigationStatus.RUNNING:
                existing.started_at = now
            elif status in (InvestigationStatus.COMPLETED, InvestigationStatus.FAILED):
                existing.completed_at = now
        else:
            steps.append(
                InvestigationStep(
                    name=name,
                    status=status,
                    message=message,
                    started_at=now if status == InvestigationStatus.RUNNING else None,
                    completed_at=(
                        now
                        if status in (InvestigationStatus.COMPLETED, InvestigationStatus.FAILED)
                        else None
                    ),
                )
            )

        await db.update_investigation(
            investigation_id,
            steps=[s.model_dump(mode="json") for s in steps],
        )
        await self._publish(
            investigation_id,
            "step",
            {"name": name.value, "status": status.value, "message": message},
        )

    def _build_prompt(self, investigation: Investigation) -> str:
        context = f"\nAdditional context: {investigation.context}" if investigation.context else ""
        return (
            f"Investigate this entity and produce a complete risk intelligence report.\n\n"
            f"Entity name: {investigation.entity_name}\n"
            f"Entity type: {investigation.entity_type.value}\n"
            f"Investigation ID: {investigation.id}{context}\n\n"
            f"ResearchAgent: Run 2 targeted searches and write a structured intelligence brief.\n"
            f"IntelligenceAgent: Execute the 5-step pipeline — extract entity → vector search → "
            f"correlate → classify signals → synthesize report. "
            f"You MUST call synthesize_risk_report as the final step."
        )

    # ------------------------------------------------------------------
    # Pipeline orchestration
    # ------------------------------------------------------------------

    async def _run_pipeline(self, investigation_id: str) -> None:
        """Top-level pipeline runner — handles all errors and timeout."""
        db = get_mongodb_service()
        investigation = await db.get_investigation(investigation_id)
        if investigation is None:
            return

        await db.update_investigation(investigation_id, status=InvestigationStatus.RUNNING.value)
        await self._publish(investigation_id, "status", {"status": "running"})
        await self._set_step(
            investigation_id,
            InvestigationStepName.RESEARCH,
            InvestigationStatus.RUNNING,
            "ResearchAgent gathering intelligence…",
        )

        try:
            await asyncio.wait_for(
                self._execute_pipeline(investigation_id, investigation),
                timeout=_PIPELINE_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            await self._fail(
                investigation_id,
                "Investigation timed out — the pipeline exceeded the 10-minute limit. Please retry.",
            )
        except Exception as exc:
            logger.exception("Pipeline error for investigation %s", investigation_id)
            await self._fail(investigation_id, _user_friendly_error(str(exc)))

    async def _fail(self, investigation_id: str, message: str) -> None:
        db = get_mongodb_service()
        await db.update_investigation(
            investigation_id,
            status=InvestigationStatus.FAILED.value,
            error=message,
        )
        await self._publish(investigation_id, "error", {"message": message})
        await self._publish(investigation_id, "done", {"status": "failed"})

    async def _execute_pipeline(
        self, investigation_id: str, investigation: Investigation
    ) -> None:
        """Core ADK agent run — called inside asyncio.wait_for."""
        db = get_mongodb_service()
        prompt = self._build_prompt(investigation)
        user_id = f"inv-{investigation_id}"

        session = await self._session_service.create_session(
            app_name=self._app_name,
            user_id=user_id,
            state={
                "investigation_id": investigation_id,
                "entity_name": investigation.entity_name,
                "entity_type": investigation.entity_type.value,
                "investigation_context": investigation.context or "",
                "investigation_query": prompt,
            },
        )

        from app.agent.orchestrator import scout_orchestrator

        runner = Runner(
            agent=scout_orchestrator,
            app_name=self._app_name,
            session_service=self._session_service,
        )

        research_done = False
        final_text = ""

        async for event in runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=types.Content(
                role="user",
                parts=[types.Part(text=prompt)],
            ),
        ):
            author = getattr(event, "author", None) or ""

            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        final_text = part.text
                        await self._publish(
                            investigation_id,
                            "agent_text",
                            {"agent": author, "text": part.text[:400]},
                        )

                    if part.function_call:
                        tool_name = getattr(part.function_call, "name", "") or ""
                        await self._publish(
                            investigation_id,
                            "tool_call",
                            {"agent": author, "tool": tool_name},
                        )
                        if research_done and tool_name in _TOOL_STEP_MESSAGES:
                            await self._set_step(
                                investigation_id,
                                InvestigationStepName.INTELLIGENCE,
                                InvestigationStatus.RUNNING,
                                _TOOL_STEP_MESSAGES[tool_name],
                            )

                    if part.function_response:
                        tool_name = getattr(part.function_response, "name", "") or ""
                        await self._publish(
                            investigation_id,
                            "tool_result",
                            {"agent": author, "tool": tool_name},
                        )

            # ResearchAgent finished
            if author == "ResearchAgent" and event.is_final_response():
                if not research_done:
                    research_done = True
                    await self._set_step(
                        investigation_id,
                        InvestigationStepName.RESEARCH,
                        InvestigationStatus.COMPLETED,
                        "Web research complete — intelligence brief ready.",
                    )
                    await self._set_step(
                        investigation_id,
                        InvestigationStepName.INTELLIGENCE,
                        InvestigationStatus.RUNNING,
                        "IntelligenceAgent profiling entity and classifying risks…",
                    )

            # IntelligenceAgent finished
            if author == "IntelligenceAgent" and event.is_final_response():
                await self._set_step(
                    investigation_id,
                    InvestigationStepName.INTELLIGENCE,
                    InvestigationStatus.COMPLETED,
                    "Intelligence analysis complete.",
                )

        # Verify synthesize_risk_report was called and completed
        updated = await db.get_investigation(investigation_id)
        if updated and updated.result and updated.result.report:
            await self._set_step(
                investigation_id,
                InvestigationStepName.COMPLETE,
                InvestigationStatus.COMPLETED,
                "Investigation complete — risk report ready.",
            )
            await self._publish(
                investigation_id,
                "investigation_completed",
                updated.model_dump(mode="json"),
            )
            await self._publish(investigation_id, "done", {"status": "completed"})
        else:
            await self._fail(
                investigation_id,
                "The intelligence pipeline completed but the final risk report was not generated. "
                "This usually means the AI stopped before calling synthesize_risk_report. Please retry.",
            )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_service: InvestigationService | None = None


def get_investigation_service() -> InvestigationService:
    global _service
    if _service is None:
        _service = InvestigationService()
    return _service
