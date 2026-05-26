"""
Shared retry helper for direct Gemini API calls in tools.

The free tier for gemini-2.5-flash is 5 RPM / 500 RPD.
The free tier for gemini-2.0-flash is 15 RPM / 1500 RPD.

We use gemini-2.0-flash for structured-extraction tool calls (entity profile,
signal classification, risk synthesis) since these are high-frequency.
The ADK agent orchestration (ResearchAgent / IntelligenceAgent model selection)
stays under config.gemini_model.

On 429 RESOURCE_EXHAUSTED, we back off and retry up to MAX_RETRIES times.
"""
import asyncio
import logging
from typing import Any, Callable, Coroutine, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Model used for all direct tool-level Gemini calls
TOOLS_GEMINI_MODEL = "gemini-2.0-flash-lite"

# Maximum retries on rate-limit errors
MAX_RETRIES = 3
# Initial backoff in seconds (doubles each retry)
INITIAL_BACKOFF = 8.0


async def gemini_with_retry(
    coro_fn: Callable[[], Coroutine[Any, Any, T]],
) -> T:
    """
    Call an async Gemini coroutine, retrying on 429 / RESOURCE_EXHAUSTED.

    Usage:
        result = await gemini_with_retry(
            lambda: client.aio.models.generate_content(model=..., contents=...)
        )
    """
    backoff = INITIAL_BACKOFF
    last_exc: Exception | None = None

    for attempt in range(1, MAX_RETRIES + 2):  # +2 so last attempt = MAX_RETRIES+1
        try:
            return await coro_fn()
        except Exception as exc:
            err_str = str(exc)
            is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str

            if is_rate_limit and attempt <= MAX_RETRIES:
                logger.warning(
                    "Gemini rate limit hit (attempt %d/%d) — backing off %.0fs…",
                    attempt,
                    MAX_RETRIES,
                    backoff,
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 120.0)  # cap at 2 minutes
                last_exc = exc
                continue

            raise  # non-rate-limit error or exhausted retries

    raise RuntimeError(f"Gemini call failed after {MAX_RETRIES} retries") from last_exc
