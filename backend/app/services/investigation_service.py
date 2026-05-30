import asyncio
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

# Map IntelligenceAgent tool calls → human-readable step messages shown in the UI
_TOOL_MESSAGES: dict[str, str] = {
    "extract_and_store_entity": "Extracting and storing entity profile…",
    "run_vector_similarity_search": "Running vector similarity search across entity database…",
    "classify_and_store_signals": "Classifying risk signals and matching watchlist patterns…",
    "synthesize_risk_report": "Synthesizing final risk report…",
    "aggregate": "Running MongoDB correlation queries…",
    "find": "Querying MongoDB entity database…",
    "insert-one": "Persisting entity record to MongoDB…",
    "update-one": "Updating investigation record in MongoDB…",
}

# How long (seconds) the agent pipeline is allowed to run before we abort
_PIPELINE_TIMEOUT = 600.0


class InvestigationService:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._app_name = self._settings.app_name
        self._session_service = InMemorySessionService()
        self._subscribers: dict[str, list[asyncio.Queue[dict[str, Any]]]] = defaultdict(list)

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
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers[investigation_id].append(queue)
        return queue

    def unsubscribe(self, investigation_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        subs = self._subscribers.get(investigation_id, [])
        if queue in subs:
            subs.remove(queue)

    async def stream_events(
        self,
        investigation_id: str,
    ) -> AsyncGenerator[dict[str, Any], None]:
        investigation = await self.get(investigation_id)
        if investigation is None:
            yield {"event": "error", "data": {"message": "Investigation not found"}}
            return

        yield {"event": "snapshot", "data": investigation.model_dump(mode="json")}

        if investigation.status in (InvestigationStatus.COMPLETED, InvestigationStatus.FAILED):
            yield {"event": "done", "data": {"status": investigation.status.value}}
            return

        queue = self.subscribe(investigation_id)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=600.0)
                except asyncio.TimeoutError:
                    yield {"event": "error", "data": {"message": "Stream timed out after 10 minutes."}}
                    break
                yield event
                if event.get("event") in ("done", "error"):
                    break
        finally:
            self.unsubscribe(investigation_id, queue)

    async def _publish(self, investigation_id: str, event: str, data: dict[str, Any]) -> None:
        payload = {"event": event, "data": data}
        for queue in self._subscribers.get(investigation_id, []):
            await queue.put(payload)

    # ------------------------------------------------------------------
    # Pipeline orchestration — FIX 3: 180-second hard timeout
    # ------------------------------------------------------------------

    async def _run_pipeline(self, investigation_id: str) -> None:
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
            "ResearchAgent running 3 targeted searches…",
        )

        try:
            await asyncio.wait_for(
                self._execute_pipeline(investigation_id, investigation),
                timeout=_PIPELINE_TIMEOUT,
            )
        except asyncio.TimeoutError:
            err = (
                f"Investigation timed out after {int(_PIPELINE_TIMEOUT)}s. "
                "Try again or check Google API quota."
            )
            await db.update_investigation(
                investigation_id,
                status=InvestigationStatus.FAILED.value,
                error=err,
            )
            await self._publish(investigation_id, "error", {"message": err})
            await self._publish(investigation_id, "done", {"status": "failed"})
        except Exception as exc:
            err_msg = str(exc)
            await db.update_investigation(
                investigation_id,
                status=InvestigationStatus.FAILED.value,
                error=err_msg,
            )
            await self._publish(investigation_id, "error", {"message": err_msg})
            await self._publish(investigation_id, "done", {"status": "failed"})

    async def _execute_pipeline(
        self, investigation_id: str, investigation: Investigation
    ) -> None:
        """Core ADK agent run — called inside asyncio.wait_for for timeout safety."""
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
                # Pre-seed research_brief so {research_brief} template in
                # INTELLIGENCE_AGENT_INSTRUCTION never throws "Context variable not found".
                # ResearchAgent will overwrite this via output_key="research_brief".
                "research_brief": "",
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
        research_text_accumulator: list[str] = []

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
                            {"agent": author, "text": part.text[:300]},
                        )
                        # Accumulate ResearchAgent text so we can back-fill
                        # the session state if ADK output_key propagation lags.
                        if author == "ResearchAgent" and not research_done:
                            research_text_accumulator.append(part.text)

                    # FIX 6: update step message in real-time based on which tool fires
                    if part.function_call:
                        tool_name = getattr(part.function_call, "name", "unknown")
                        await self._publish(
                            investigation_id,
                            "tool_call",
                            {"agent": author, "tool": tool_name},
                        )
                        if research_done and tool_name in _TOOL_MESSAGES:
                            await self._set_step(
                                investigation_id,
                                InvestigationStepName.INTELLIGENCE,
                                InvestigationStatus.RUNNING,
                                _TOOL_MESSAGES[tool_name],
                            )

                    if part.function_response:
                        tool_name = getattr(part.function_response, "name", "unknown")
                        await self._publish(
                            investigation_id,
                            "tool_result",
                            {"agent": author, "tool": tool_name},
                        )

            # ResearchAgent finished → explicitly write research_brief to session
            # state so the {research_brief} template in INTELLIGENCE_AGENT_INSTRUCTION
            # is guaranteed to resolve even if ADK output_key propagation is delayed.
            if author == "ResearchAgent" and event.is_final_response():
                if not research_done:
                    research_done = True
                    # Back-fill session state with the accumulated research text.
                    # This ensures {research_brief} template never throws "Context variable not found".
                    compiled_brief = "\n".join(research_text_accumulator).strip()
                    if compiled_brief:
                        try:
                            existing_session = await self._session_service.get_session(
                                app_name=self._app_name,
                                user_id=user_id,
                                session_id=session.id,
                            )
                            if existing_session is not None:
                                existing_session.state["research_brief"] = compiled_brief
                        except Exception:
                            pass  # Non-fatal — output_key should have set it already
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
                    "Entity intelligence analysis complete.",
                )

        # Check whether synthesize_risk_report was actually called
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
            err = (
                "Agent pipeline finished but synthesize_risk_report was never called. "
                "The IntelligenceAgent may have stopped early. Check agent logs."
            )
            await db.update_investigation(
                investigation_id,
                status=InvestigationStatus.FAILED.value,
                error=err,
                metadata={"raw_output": final_text[:3000]},
            )
            await self._publish(investigation_id, "error", {"message": err})
            await self._publish(investigation_id, "done", {"status": "failed"})

    # ------------------------------------------------------------------
    # Step management
    # ------------------------------------------------------------------

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
                    completed_at=now if status in (InvestigationStatus.COMPLETED, InvestigationStatus.FAILED) else None,
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

    # ------------------------------------------------------------------
    # Prompt builder
    # ------------------------------------------------------------------

    def _build_prompt(self, investigation: Investigation) -> str:
        context_line = f"\nAdditional context: {investigation.context}" if investigation.context else ""
        return (
            f"Investigate this entity and produce a complete risk intelligence report.\n\n"
            f"Entity name: {investigation.entity_name}\n"
            f"Entity type: {investigation.entity_type.value}\n"
            f"Investigation ID: {investigation.id}{context_line}\n\n"
            f"ResearchAgent: Run exactly 3 targeted Google searches and produce a structured intelligence brief.\n"
            f"IntelligenceAgent: Execute the 5-step pipeline — extract entity → vector search → "
            f"correlation query → classify signals → synthesize report. "
            f"You MUST call synthesize_risk_report as the final step."
        )


_investigation_service: InvestigationService | None = None


def get_investigation_service() -> InvestigationService:
    global _investigation_service
    if _investigation_service is None:
        _investigation_service = InvestigationService()
    return _investigation_service
