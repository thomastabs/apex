"""Tests for GET /api/usage/summary's Plane branch (phase 5a).

Before this fix `usage_summary` called `anchor_instance_id(x_taiga_url)` with
only one argument, silently ignoring X-Plane-Url for a Plane-anchored
session — every AI-usage lookup for a Plane user would read/write the Taiga
default instance's storage instead of its own. This file proves the fix:
a Plane-anchored request configures the usage service with a DIFFERENT
storage instance_id than a Taiga-anchored (or anchor-less) request.
"""

from unittest.mock import MagicMock

from backend.app.api.deps import AuthContext, anchor_instance_id
from backend.app.api.usage import usage_summary

_PLANE_URL = "https://plane.example.org"


def _plane_instance_id() -> str:
    return anchor_instance_id("", _PLANE_URL)


def _taiga_instance_id() -> str:
    return anchor_instance_id("", "")


def test_usage_summary_plane_branch_configures_service_with_plane_instance():
    service = MagicMock()
    service.summary.return_value = {"total_calls": 0, "total_cost_usd": 0.0}

    response = usage_summary(
        days=30,
        auth=AuthContext(pm_token="tok"),
        x_plane_url=_PLANE_URL,
        service=service,
    )

    plane_instance = _plane_instance_id()
    service.configure_request.assert_called_once_with(plane_instance)
    service.summary.assert_called_once_with(30)
    assert response == {"total_calls": 0, "total_cost_usd": 0.0}
    assert plane_instance != _taiga_instance_id()


def test_usage_summary_taiga_branch_configures_service_with_taiga_instance():
    service = MagicMock()
    service.summary.return_value = {"total_calls": 0, "total_cost_usd": 0.0}

    usage_summary(days=7, auth=AuthContext(pm_token="tok"), x_taiga_url="", service=service)

    service.configure_request.assert_called_once_with(_taiga_instance_id())
