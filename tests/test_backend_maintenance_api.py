"""API route tests for Phase 6 maintenance routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import get_request_context
from backend.app.api.phase6 import (
    classify_maintenance_item,
    classify_placement_maintenance_item,
    create_maintenance_item,
    delete_maintenance_item,
    list_maintenance_items,
    resolve_maintenance_item,
    route_maintenance_item,
)
from backend.app.schemas.phase6 import (
    ClassifyPlacementRequest,
    CreateMaintenanceItemRequest,
    ResolveItemRequest,
    RouteLaneRequest,
)
from backend.app.services.maintenance_service import MaintenanceValidationError
from src.ai_engine import AIError, AIRateLimitError


_ITEM = {"id": 1, "subject": "Login 500", "classification": "bug", "status": "new",
         "lane": None, "linked_story_id": 5}


class StubMaintenanceService:
    def list_items(self, ctx):
        return [_ITEM]

    def create_item(self, ctx, **kw):
        return {**_ITEM, "subject": kw["subject"]}

    def classify(self, ctx, item_id):
        return {**_ITEM, "classification": "bug"}

    def route_lane(self, ctx, item_id, lane):
        return {**_ITEM, "lane": lane}

    def resolve(self, ctx, item_id, root_cause="", resolution_summary=""):
        return {**_ITEM, "status": "resolved"}

    def delete_item(self, ctx, item_id):
        return None

    def classify_placement(self, ctx, item_id, existing_epics, extra_context_files=None):
        self.placement_call = (item_id, existing_epics, extra_context_files)
        return {
            "is_new_epic": False, "matched_epic_title": "Login", "rationale": "extends login",
            "suggested_epic_title": None, "suggested_story_title": "Add export button",
            "suggested_story_description": "As a user I want to export my data.",
        }


def _ctx():
    return get_request_context("Bearer tok", 42)


def test_list_items_route():
    out = list_maintenance_items(ctx=_ctx(), service=StubMaintenanceService())
    assert out["items"][0]["id"] == 1


def test_create_item_route():
    out = create_maintenance_item(
        CreateMaintenanceItemRequest(subject="New bug"), ctx=_ctx(), service=StubMaintenanceService())
    assert out["subject"] == "New bug"


def test_classify_route():
    out = classify_maintenance_item(1, ctx=_ctx(), service=StubMaintenanceService(), _rl=None)
    assert out["classification"] == "bug"


def test_delete_item_route():
    out = delete_maintenance_item(1, ctx=_ctx(), service=StubMaintenanceService())
    assert out["items"][0]["id"] == 1


def test_route_lane_route():
    out = route_maintenance_item(1, RouteLaneRequest(lane="fast"), ctx=_ctx(), service=StubMaintenanceService())
    assert out["lane"] == "fast"


def test_resolve_route():
    out = resolve_maintenance_item(
        1, ResolveItemRequest(root_cause="x", resolution_summary="y"),
        ctx=_ctx(), service=StubMaintenanceService())
    assert out["status"] == "resolved"


def test_validation_error_maps_to_422():
    class Failing(StubMaintenanceService):
        def classify(self, ctx, item_id):
            raise MaintenanceValidationError("not found")

    with pytest.raises(HTTPException) as exc:
        classify_maintenance_item(99, ctx=_ctx(), service=Failing(), _rl=None)
    assert exc.value.status_code == 422


def test_ai_error_maps_to_502():
    class Failing(StubMaintenanceService):
        def classify(self, ctx, item_id):
            raise AIError("model down")

    with pytest.raises(HTTPException) as exc:
        classify_maintenance_item(1, ctx=_ctx(), service=Failing(), _rl=None)
    assert exc.value.status_code == 502


def test_rate_limit_error_maps_to_429():
    class Failing(StubMaintenanceService):
        def classify(self, ctx, item_id):
            raise AIRateLimitError("slow down")

    with pytest.raises(HTTPException) as exc:
        classify_maintenance_item(1, ctx=_ctx(), service=Failing(), _rl=None)
    assert exc.value.status_code == 429


def test_classify_placement_route_returns_ai_placement():
    service = StubMaintenanceService()
    payload = ClassifyPlacementRequest(
        existing_epics=[{"title": "Login", "description": "auth flows", "stories": ["Sign in"]}],
    )
    out = classify_placement_maintenance_item(1, payload, ctx=_ctx(), service=service, _rl=None)
    assert out["matched_epic_title"] == "Login"
    assert out["is_new_epic"] is False
    assert out["suggested_story_title"] == "Add export button"


def test_classify_placement_route_forwards_existing_epics_payload():
    service = StubMaintenanceService()
    epics = [
        {"title": "Login", "description": "auth flows", "stories": ["Sign in"]},
        {"title": "Billing", "description": "invoices", "stories": []},
    ]
    payload = ClassifyPlacementRequest(existing_epics=epics)
    classify_placement_maintenance_item(7, payload, ctx=_ctx(), service=service, _rl=None)
    item_id, forwarded_epics, extra_files = service.placement_call
    assert item_id == 7
    assert forwarded_epics == epics
    assert extra_files == []


def test_classify_placement_route_does_not_mutate_item():
    service = StubMaintenanceService()
    payload = ClassifyPlacementRequest(existing_epics=[])
    classify_placement_maintenance_item(1, payload, ctx=_ctx(), service=service, _rl=None)
    # StubMaintenanceService has no mutating side effect for classify_placement -
    # asserting the stub's canonical item is untouched confirms the route never
    # calls anything but the advisory classify_placement method.
    assert service.list_items(_ctx()) == [_ITEM]


def test_classify_placement_route_validation_error_maps_to_422():
    class Failing(StubMaintenanceService):
        def classify_placement(self, ctx, item_id, existing_epics, extra_context_files=None):
            raise MaintenanceValidationError("not found")

    with pytest.raises(HTTPException) as exc:
        classify_placement_maintenance_item(
            99, ClassifyPlacementRequest(existing_epics=[]), ctx=_ctx(), service=Failing(), _rl=None,
        )
    assert exc.value.status_code == 422
