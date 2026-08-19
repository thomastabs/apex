"""Tests for the generalized wiki-sync routes in backend/app/api/workspace.py
(GET /context-files/wiki-status, POST .../wiki/publish, POST .../wiki/pull)
that dispatch between taiga_wiki_service and plane_wiki_service based on the
configured pm_tool. Mirrors test_backend_workspace_status_mapping.py's
pattern of calling route functions directly against the `ctx` fixture's
isolated storage rather than going through TestClient.
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


# --------------------------------------------------------------------------
# GET /context-files/wiki-status
# --------------------------------------------------------------------------


def test_wiki_status_plane_mode_calls_plane_service_not_taiga(plane_ctx):
    fake_pages = [
        {"filename": "project-concept.md", "label": "Project Concept", "slug": "apex-project-concept",
         "title": "Apex: Project Concept", "exists": True, "wiki_id": "11", "chars": 5,
         "last_modified": None, "source": "apex", "is_custom": False},
    ]
    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}), \
         patch("backend.app.api.workspace.resolve_plane_base", return_value="https://api.plane.so/api/v1"), \
         patch("backend.app.services.plane_wiki_service.status", return_value=fake_pages) as plane_status, \
         patch("backend.app.services.taiga_wiki_service.status", side_effect=AssertionError("must not call taiga_wiki_service in plane mode")) as taiga_status:
        result = workspace.get_context_wiki_status(
            plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="myteam",
        )

    assert result["pages"] == fake_pages
    plane_status.assert_called_once()
    taiga_status.assert_not_called()
    call_args = plane_status.call_args.args
    assert call_args[0] == "https://api.plane.so/api/v1"
    assert call_args[1] == "tok"
    assert call_args[2] == "myteam"
    assert call_args[3] == UUID


def test_wiki_status_plane_header_overrides_stale_saved_taiga_config(plane_ctx):
    fake_pages = [
        {"filename": "project-concept.md", "label": "Project Concept", "slug": "apex-project-concept",
         "title": "Apex: Project Concept", "exists": False, "wiki_id": None, "chars": 0,
         "last_modified": None, "source": "apex", "is_custom": False},
    ]
    with patch("src.context_manager.load_config", return_value={"pm_tool": "taiga"}), \
         patch("backend.app.api.workspace.resolve_plane_base", return_value="https://plane.local/api/v1"), \
         patch("backend.app.services.plane_wiki_service.status", return_value=fake_pages) as plane_status, \
         patch("backend.app.services.taiga_wiki_service.status", side_effect=AssertionError("stale saved config must not choose Taiga")):
        result = workspace.get_context_wiki_status(
            plane_ctx, x_plane_url="https://plane.local", x_plane_workspace="myteam",
        )

    assert result["pages"] == fake_pages
    plane_status.assert_called_once()


def test_wiki_status_plane_mode_requires_workspace_header(plane_ctx):
    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}):
        with pytest.raises(Exception) as exc:
            workspace.get_context_wiki_status(plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="")
    assert getattr(exc.value, "status_code", None) == 400


# --------------------------------------------------------------------------
# POST /context-files/wiki/publish
# --------------------------------------------------------------------------


def test_wiki_publish_plane_mode_calls_plane_service_not_taiga(plane_ctx):
    fake_results = [
        {"filename": "project-concept.md", "slug": "apex-project-concept", "action": "created", "ok": True, "detail": ""},
    ]
    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}), \
         patch("backend.app.api.workspace.resolve_plane_base", return_value="https://api.plane.so/api/v1"), \
         patch("backend.app.services.plane_wiki_service.publish", return_value=fake_results) as plane_publish, \
         patch("backend.app.services.taiga_wiki_service.publish", side_effect=AssertionError("must not call taiga_wiki_service in plane mode")) as taiga_publish:
        result = workspace.publish_context_to_wiki(
            None, plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="myteam",
        )

    assert result["ok"] is True
    assert result["results"] == fake_results
    plane_publish.assert_called_once()
    taiga_publish.assert_not_called()
    call_args = plane_publish.call_args.args
    assert call_args[2] == "myteam"
    assert call_args[3] == UUID


def test_wiki_publish_plane_mode_requires_workspace_header(plane_ctx):
    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}):
        with pytest.raises(Exception) as exc:
            workspace.publish_context_to_wiki(None, plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="")
    assert getattr(exc.value, "status_code", None) == 400


# --------------------------------------------------------------------------
# POST /context-files/wiki/pull
# --------------------------------------------------------------------------


def test_wiki_pull_plane_mode_calls_plane_service_with_wiki_id_selection(plane_ctx):
    fake_status_pages = [
        {"filename": "project-concept.md", "label": "Project Concept", "slug": "apex-project-concept",
         "title": "Apex: Project Concept", "exists": True, "wiki_id": "11", "chars": 5,
         "last_modified": None, "source": "apex", "is_custom": False},
    ]
    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}), \
         patch("backend.app.api.workspace.resolve_plane_base", return_value="https://api.plane.so/api/v1"), \
         patch("backend.app.services.plane_wiki_service.status", return_value=fake_status_pages), \
         patch("backend.app.services.plane_wiki_service.pull", return_value=([{"filename": "project-concept.md", "slug": "apex-project-concept", "action": "pulled", "ok": True, "detail": ""}], {"project-concept.md": "pulled content"})) as plane_pull, \
         patch("backend.app.services.taiga_wiki_service.pull", side_effect=AssertionError("must not call taiga_wiki_service in plane mode")) as taiga_pull:
        result = workspace.pull_context_from_wiki(
            None, plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="myteam",
        )

    assert result["ok"] is True
    plane_pull.assert_called_once()
    taiga_pull.assert_not_called()
    # The 3rd tuple element passed through to pull() must be the Plane wiki_id,
    # not a slug (see _selected_wiki_file_labels' id_key="wiki_id" for Plane).
    selected = plane_pull.call_args.args[4]
    assert selected == [("project-concept.md", "Project Concept", "11")]


def test_wiki_pull_plane_mode_requires_workspace_header(plane_ctx):
    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}):
        with pytest.raises(Exception) as exc:
            workspace.pull_context_from_wiki(None, plane_ctx, x_plane_url="https://api.plane.so", x_plane_workspace="")
    assert getattr(exc.value, "status_code", None) == 400


# --------------------------------------------------------------------------
# _selected_wiki_file_labels
# --------------------------------------------------------------------------


def _fake_pages():
    return [
        {"filename": "a.md", "label": "A", "slug": "apex-a", "wiki_id": "111", "is_custom": False},
        {"filename": "b.md", "label": "B", "slug": "apex-b", "wiki_id": "222", "is_custom": False},
        {"filename": "wiki-custom.md", "label": "Custom", "slug": "custom", "wiki_id": "333", "is_custom": True},
    ]


def test_selected_wiki_file_labels_uses_slug_for_taiga():
    selected = workspace._selected_wiki_file_labels(_fake_pages(), ["a.md", "b.md"], id_key="slug")
    assert selected == [("a.md", "A", "apex-a"), ("b.md", "B", "apex-b")]


def test_selected_wiki_file_labels_uses_wiki_id_for_plane():
    selected = workspace._selected_wiki_file_labels(_fake_pages(), ["a.md", "b.md"], id_key="wiki_id")
    assert selected == [("a.md", "A", "111"), ("b.md", "B", "222")]


def test_selected_wiki_file_labels_default_selection_excludes_custom_pages():
    selected = workspace._selected_wiki_file_labels(_fake_pages(), None, id_key="wiki_id")
    assert selected == [("a.md", "A", "111"), ("b.md", "B", "222")]


def test_selected_wiki_file_labels_unknown_filename_raises_404():
    with pytest.raises(Exception) as exc:
        workspace._selected_wiki_file_labels(_fake_pages(), ["does-not-exist.md"], id_key="slug")
    assert getattr(exc.value, "status_code", None) == 404


# --------------------------------------------------------------------------
# _require_wiki_pm
# --------------------------------------------------------------------------


def test_require_wiki_pm_rejects_unknown_pm_tool():
    with patch("src.context_manager.load_config", return_value={"pm_tool": "jira"}):
        with pytest.raises(Exception) as exc:
            workspace._require_wiki_pm("", "", "")
    assert getattr(exc.value, "status_code", None) == 400
