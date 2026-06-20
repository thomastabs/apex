"""Analytics N+1 kill: conformance score + verification completeness are mirrored
into story-index at save time, so the summary reads the single index file instead
of an O(stories) fan-out of per-story JSON reads on the File Share."""

import pytest

from backend.app.services.analytics_service import AnalyticsService


def test_save_conformance_mirrors_score_into_index(ctx):
    from src import context_manager

    ctx.set_active_project(1)
    context_manager.upsert_story_index(10, phase_status="implementation", title="S")
    context_manager.save_conformance(10, {"score": 80, "endpoints": []})
    assert context_manager.get_story_index()["10"]["conformance_score"] == 80


def test_save_verification_mirrors_complete_into_index(ctx):
    from src import context_manager

    ctx.set_active_project(1)
    context_manager.upsert_story_index(11, phase_status="deployed", title="S")
    context_manager.save_verification(11, {"complete": True})
    assert context_manager.get_story_index()["11"]["verification_complete"] is True


def test_conformance_uses_index_score_without_reading_files():
    class NoFileCtx:
        def load_conformance(self, story_id):  # pragma: no cover - must not run
            raise AssertionError("fast path must not read the conformance file")

    svc = AnalyticsService(context=NoFileCtx())
    entries = [
        {"story_id": 1, "phase_status": "deployed", "conformance_score": 90},
        {"story_id": 2, "phase_status": "deployed", "conformance_score": 70},
    ]
    assert svc._conformance(entries) == {"eligible": 2, "checked": 2, "avg_score": 80.0}


def test_conformance_falls_back_to_file_when_index_lacks_score():
    class FileCtx:
        def load_conformance(self, story_id):
            return {"score": 55} if story_id == 1 else None

    svc = AnalyticsService(context=FileCtx())
    entries = [
        {"story_id": 1, "phase_status": "deployed"},  # no mirrored score → file read
        {"story_id": 2, "phase_status": "deployed"},  # no report at all
    ]
    assert svc._conformance(entries) == {"eligible": 2, "checked": 1, "avg_score": 55.0}
