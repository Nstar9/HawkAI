"""
Shared retry helper for direct Gemini API calls inside HawkAI tools.

All tool-level Gemini calls (entity extraction, signal classification,
risk synthesis) use get_tools_model() so a single GEMINI_MODEL env-var
swap covers the entire stack.

Retry policy:
  - 429 RESOURCE_EXHAUSTED  → back off and retry (quota / rate-limit)
  - 503 UNAVAILABLE         → back off and retry (transient overload)
  - 500 INTERNAL            → back off and retry (transient server error)
  - any other exception     → propagate immediately
"""

import asyncio
import logging
from typing import Any, Callable, Coroutine, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Retry configuration
MAX_RETRIES = 3
INITIAL_BACKOFF_SECONDS = 5.0
MAX_BACKOFF_SECONDS = 60.0

# Error codes/keywords that warrant a retry
_RETRYABLE_KEYWORDS = (
    "429",
    "RESOURCE_EXHAUSTED",
    "503",
    "UNAVAILABLE",
    "500",
    "INTERNAL",
    "overloaded",
    "high demand",
)


def get_tools_model() -> str:
    """Return the configured Gemini model — read from settings at call time."""
    from app.config import get_settings
    return get_settings().gemini_model


def _is_retryable(exc: Exception) -> bool:
    err = str(exc)
    return any(kw in err for kw in _RETRYABLE_KEYWORDS)


async def gemini_with_retry(
    coro_fn: Callable[[], Coroutine[Any, Any, T]],
) -> T:
    """Call an async Gemini coroutine, retrying on transient errors.

    Usage:
        result = await gemini_with_retry(
            lambda: client.aio.models.generate_content(model=..., contents=...)
        )
    """
    backoff = INITIAL_BACKOFF_SECONDS
    last_exc: Exception | None = None

    for attempt in range(1, MAX_RETRIES + 2):
        try:
            return await coro_fn()
        except Exception as exc:
            if _is_retryable(exc) and attempt <= MAX_RETRIES:
                logger.warning(
                    "Gemini transient error (attempt %d/%d) — backing off %.0fs | %s",
                    attempt,
                    MAX_RETRIES,
                    backoff,
                    str(exc)[:120],
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)
                last_exc = exc
                continue
            raise

    raise RuntimeError(
        f"Gemini call failed after {MAX_RETRIES} retries"
    ) from last_exc
