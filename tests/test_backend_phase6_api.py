"""API route tests for Phase 6 spec↔code conformance routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import get_request_context
from backend.app.api.phase6 import (
    eligible_stories,
    get_conformance,
    verify_conformance,
)
from backend.app.schemas.phase6 import VerifyConformanceRequest
from backend.app.services.phase6_service import Phase6ValidationError
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError


_REPORT = {
    "story_id": 10, "title": "Login", "epic_title": "Auth", "layer": "ai",
    "score": 75, "summary": "ok", "endpoints": [], "scenarios": [], "constraints": [],
    "generated_at": "2026-06-16T00:00:00Z",
}


class StubPhase6Service:
    def configure_request(self, ctx):
        pass

    def get_eligible_stories(self, ctx):
        return [{
            "story_id": 10, "title": "Login", "epic_title": "Auth",
            "phase_status": "implementation", "has_conformance": True, "score": 75,
        }]

    def verify_conformance(self, ctx, story_id, *, ai=True):
        return {**_REPORT, "story_id": story_id, "layer": "ai" if ai else "deterministic"}

    def get_conformance(self, ctx, story_id):
        return {**_REPORT, "story_id": story_id} if story_id == 10 else None


def _ctx():
    return get_request_context("Bearer tok", 42)


def test_eligible_stories_route():
    result = eligible_stories(ctx=_ctx(), service=StubPhase6Service())
    assert result["stories"][0]["story_id"] == 10
    assert result["stories"][0]["score"] == 75


def test_verify_conformance_route():
    result = verify_conformance(
        VerifyConformanceRequest(story_id=10), ctx=_ctx(), service=StubPhase6Service(), _rl=None,
    )
    assert result["story_id"] == 10 and result["layer"] == "ai"


def test_verify_conformance_deterministic_flag():
    result = verify_conformance(
        VerifyConformanceRequest(story_id=10, ai=False),
        ctx=_ctx(), service=StubPhase6Service(), _rl=None,
    )
    assert result["layer"] == "deterministic"


def test_get_conformance_route():
    result = get_conformance(story_id=10, ctx=_ctx(), service=StubPhase6Service())
    assert result["story_id"] == 10 and result["score"] == 75


def test_get_conformance_404_when_absent():
    with pytest.raises(HTTPException) as exc:
        get_conformance(story_id=999, ctx=_ctx(), service=StubPhase6Service())
    assert exc.value.status_code == 404


def test_validation_error_maps_to_422():
    class Failing(StubPhase6Service):
        def verify_conformance(self, ctx, story_id, *, ai=True):
            raise Phase6ValidationError("not eligible")

    with pytest.raises(HTTPException) as exc:
        verify_conformance(
            VerifyConformanceRequest(story_id=2), ctx=_ctx(), service=Failing(), _rl=None,
        )
    assert exc.value.status_code == 422


@pytest.mark.parametrize("err,code", [
    (AIRateLimitError("x"), 429),
    (AITimeoutError("x"), 504),
    (AIError("x"), 502),
])
def test_ai_errors_map(err, code):
    class Failing(StubPhase6Service):
        def verify_conformance(self, ctx, story_id, *, ai=True):
            raise err

    with pytest.raises(HTTPException) as exc:
        verify_conformance(
            VerifyConformanceRequest(story_id=10), ctx=_ctx(), service=Failing(), _rl=None,
        )
    assert exc.value.status_code == code
