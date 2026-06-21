"""API route tests for Phase 6 spec↔code conformance routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import get_request_context
from backend.app.api.phase6 import (
    acknowledge_regression,
    eligible_stories,
    get_conformance,
    scan_regressions,
    verify_conformance,
)
from backend.app.schemas.phase6 import ScanRegressionsRequest, VerifyConformanceRequest
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

    def verify_conformance(self, ctx, story_id, *, ai=True, panel=False, extra_files=None):
        layer = "panel" if panel else "ai" if ai else "deterministic"
        report = {**_REPORT, "story_id": story_id, "layer": layer}
        if panel:
            report["panel_meta"] = {"escalated": 1, "rows": [{
                "ref": "POST /x", "kind": "endpoint", "status": "present",
                "citation": "api/x.py:1", "agreement": "unanimous", "rationale": "ok"}]}
        return report

    def get_conformance(self, ctx, story_id):
        return {**_REPORT, "story_id": story_id} if story_id == 10 else None

    def scan_regressions(self, ctx, *, panel=False):
        return {
            "results": [{
                "story_id": 10, "title": "Login", "old_score": 90, "new_score": 60,
                "regressed": True,
                "worsened_rows": [{"ref": "POST /a", "kind": "endpoint",
                                   "old_status": "present", "new_status": "missing"}],
            }],
            "regressed_ids": [10],
        }

    def acknowledge_regression(self, ctx, story_id):
        self.acked = story_id


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


def test_verify_conformance_panel_flag():
    result = verify_conformance(
        VerifyConformanceRequest(story_id=10, panel=True),
        ctx=_ctx(), service=StubPhase6Service(), _rl=None,
    )
    assert result["layer"] == "panel"
    assert result["panel_meta"]["escalated"] == 1
    assert result["panel_meta"]["rows"][0]["agreement"] == "unanimous"


def test_verify_conformance_deterministic_flag():
    result = verify_conformance(
        VerifyConformanceRequest(story_id=10, ai=False),
        ctx=_ctx(), service=StubPhase6Service(), _rl=None,
    )
    assert result["layer"] == "deterministic"


def test_scan_regressions_route():
    result = scan_regressions(
        ScanRegressionsRequest(), ctx=_ctx(), service=StubPhase6Service(), _rl=None,
    )
    assert result["regressed_ids"] == [10]
    assert result["results"][0]["regressed"] is True
    assert result["results"][0]["worsened_rows"][0]["new_status"] == "missing"


def test_acknowledge_regression_route():
    svc = StubPhase6Service()
    result = acknowledge_regression(story_id=10, ctx=_ctx(), service=svc)
    assert result["acknowledged"] is True and svc.acked == 10


def test_get_conformance_route():
    result = get_conformance(story_id=10, ctx=_ctx(), service=StubPhase6Service())
    assert result["story_id"] == 10 and result["score"] == 75


def test_get_conformance_404_when_absent():
    with pytest.raises(HTTPException) as exc:
        get_conformance(story_id=999, ctx=_ctx(), service=StubPhase6Service())
    assert exc.value.status_code == 404


def test_validation_error_maps_to_422():
    class Failing(StubPhase6Service):
        def verify_conformance(self, ctx, story_id, *, ai=True, panel=False, extra_files=None):
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
        def verify_conformance(self, ctx, story_id, *, ai=True, panel=False, extra_files=None):
            raise err

    with pytest.raises(HTTPException) as exc:
        verify_conformance(
            VerifyConformanceRequest(story_id=10), ctx=_ctx(), service=Failing(), _rl=None,
        )
    assert exc.value.status_code == code
