"""Tests for GET/POST /api/workspace/status-mapping's Plane branch (phase 4a).

The Taiga branch had no dedicated test file before this (a pre-existing gap,
not backfilled here — this covers only the new Plane code path added in
phase 4a, see plane_integration_plan memory).
"""

from unittest.mock import patch

import pytest

from backend.app.api import workspace
from backend.app.services.request_context import RequestContext

UUID = "f722d8f5-57a4-4c98-8651-f7e89970c359"


@pytest.fixture()
def plane_ctx(ctx):
    """RequestContext anchored to a Plane project (UUID id) on top of the
    isolated-storage `ctx` fixture from conftest."""
    return RequestContext(pm_token="tok", project_id=UUID, instance_id="api_plane_so")


def _states():
    return [
        {"id": "s1", "name": "Backlog", "group": "backlog"},
        {"id": "s2", "name": "In Progress", "group": "started"},
        {"id": "s3", "name": "Done", "group": "completed"},
    ]


def test_get_status_mapping_plane_branch_maps_state_group(plane_ctx):
    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}), \
         patch("backend.app.api.workspace.resolve_plane_base", return_value="https://api.plane.so/api/v1"), \
         patch("backend.app.services.import_service._plane_get_all", return_value=_states()) as get_all:
        result = workspace.get_status_mapping(
            plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="my-team",
        )

    assert result["pm_tool"] == "plane"
    by_id = {e["id"]: e for e in result["statuses"]}
    assert by_id["s1"]["default_status"] == "gherkin_locked"
    assert by_id["s2"]["default_status"] == "implementation"
    assert by_id["s3"]["default_status"] == "deployed"
    assert by_id["s3"]["is_closed"] is True
    assert by_id["s1"]["is_closed"] is False
    # Fetched from the right project (states endpoint scoped to it).
    call_path = get_all.call_args.args[2]
    assert call_path == f"workspaces/my-team/projects/{UUID}/states/"


def test_get_status_mapping_plane_branch_requires_workspace_header(plane_ctx):
    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}):
        with pytest.raises(Exception) as exc:
            workspace.get_status_mapping(plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="")
    assert getattr(exc.value, "status_code", None) == 400


def test_get_status_mapping_plane_branch_respects_saved_override(plane_ctx):
    # Save through the route (not the raw ctx fixture directly) — the route's
    # own context.set_active(plane_ctx) is what points storage at the UUID
    # project; the fixture's ContextVar alone still points at its own
    # int test project until a route call switches it.
    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}), \
         patch("backend.app.api.workspace.resolve_plane_base", return_value="https://api.plane.so/api/v1"), \
         patch("backend.app.services.import_service._plane_get_all", return_value=_states()):
        workspace.save_status_mapping(
            workspace.SaveStatusMappingRequest(mapping={"s1": "qa_passed"}),
            plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="my-team",
        )
        result = workspace.get_status_mapping(
            plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="my-team",
        )
    by_id = {e["id"]: e for e in result["statuses"]}
    assert by_id["s1"]["mapped_status"] == "qa_passed"
    assert by_id["s1"]["source"] == "configured"
    assert by_id["s2"]["source"] == "default"


def test_get_status_mapping_plane_branch_rejects_malformed_workspace_slug(plane_ctx):
    # SECURITY REGRESSION (2026-08-06) — this route builds its own URL from
    # x_plane_workspace directly (not through _pm_endpoints), so it needs its
    # own explicit validation call; confirm it's actually wired in.
    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}), \
         patch("backend.app.api.workspace.resolve_plane_base", return_value="https://api.plane.so/api/v1"):
        with pytest.raises(Exception) as exc:
            workspace.get_status_mapping(
                plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="../other-team",
            )
    assert getattr(exc.value, "status_code", None) == 400


def test_save_status_mapping_plane_branch_persists_and_rereads(plane_ctx):
    payload = workspace.SaveStatusMappingRequest(mapping={"s2": "implementation"})
    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}), \
         patch("backend.app.api.workspace.resolve_plane_base", return_value="https://api.plane.so/api/v1"), \
         patch("backend.app.services.import_service._plane_get_all", return_value=_states()):
        result = workspace.save_status_mapping(
            payload, plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="my-team",
        )
    assert result["mapping"] == {"s2": "implementation"}
