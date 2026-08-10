"""Request context passed from API routes into backend services."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RequestContext:
    pm_token: str
    # Taiga: real numeric project id. Plane: real UUID project id (a string —
    # widened 2026-08-06, phase 4a, see plane_integration_plan memory).
    # ContextService/context_manager only ever str()-ify this for storage
    # paths, so both shapes flow through unchanged everywhere except code
    # that does int-specific arithmetic on it directly (none does).
    project_id: int | str
    # Storage namespace for the PM instance this request authenticated against
    # (contextspec/<instance_id>/<project_id>/…). Derived server-side from the
    # validated anchor URL — see deps.get_request_context.
    instance_id: str = "default"
