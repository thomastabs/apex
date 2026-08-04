"""Single AI-error -> HTTP mapping, shared by every route that calls the AI engine.

This mapping used to be copy-pasted into all six phase routers plus workspace.py,
which is how several failure modes ended up unmapped in every copy at once: an
invalid model id, a rejected API key and a context-window overflow all fell
through to a bare 500 "Internal server error".

Responses carry a structured detail — `{"code": ..., "message": ...}` — so the
frontend classifies the failure exactly (lib/errors.ts) instead of pattern-
matching prose. `ApiError.messageFor` still surfaces `message` as the error
text, so a caller that only reads `.message` keeps working.
"""

from __future__ import annotations

import logging
from typing import NoReturn

from fastapi import HTTPException, status

from src.ai_engine import (
    AIAuthError,
    AIContentFilterError,
    AIContextLengthError,
    AIError,
    AIModelError,
    AIRateLimitError,
    AITimeoutError,
    AIValidationError,
)

_logger = logging.getLogger("apex.ai_errors")

# AIError subclass -> HTTP status. Order matters only in that subclasses must be
# listed before their bases; the lookup below walks the MRO.
_STATUS_BY_TYPE: tuple[tuple[type[AIError], int], ...] = (
    (AIRateLimitError, status.HTTP_429_TOO_MANY_REQUESTS),
    (AITimeoutError, status.HTTP_504_GATEWAY_TIMEOUT),
    # Configuration problems the user can actually fix. Reporting these as 502
    # ("upstream broke") told the user to wait and retry, which never helped.
    (AIAuthError, status.HTTP_401_UNAUTHORIZED),
    (AIModelError, status.HTTP_400_BAD_REQUEST),
    (AIContextLengthError, status.HTTP_413_CONTENT_TOO_LARGE),
    (AIContentFilterError, status.HTTP_502_BAD_GATEWAY),
    (AIValidationError, status.HTTP_502_BAD_GATEWAY),
)


def ai_error_response(exc: AIError) -> HTTPException:
    """Build the HTTPException for an AIError without raising it."""
    http_status = status.HTTP_502_BAD_GATEWAY
    for exc_type, mapped in _STATUS_BY_TYPE:
        if isinstance(exc, exc_type):
            http_status = mapped
            break
    message = str(exc) or "The AI request failed."
    if isinstance(exc, AIValidationError):
        # The raw text is a Pydantic validation dump — useless in a toast, and
        # the actual advice ("retry, or try another model") is not in it.
        message = "The model returned output that did not match the expected format. Retry, or try a different model."
    # These paths raised with no logging at all, so an AI 429/502/504 left no
    # server-side trace to correlate a user report against.
    _logger.warning("ai_error code=%s status=%d detail=%s", exc.code, http_status, str(exc)[:500])
    return HTTPException(status_code=http_status, detail={"code": exc.code, "message": message})


def handle_ai_error(exc: Exception) -> NoReturn:
    """Re-raise *exc* as the right HTTPException, or unchanged if not AI-related."""
    if isinstance(exc, AIError):
        raise ai_error_response(exc) from exc
    if isinstance(exc, EnvironmentError):
        # check_api_key() raises this with an actionable message naming the env
        # var and the Settings screen — a config problem, not a gateway failure.
        _logger.warning("ai_config_error detail=%s", str(exc)[:500])
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "ai_key_missing", "message": str(exc)},
        ) from exc
    raise exc
