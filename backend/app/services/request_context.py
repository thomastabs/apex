"""Request context passed from API routes into backend services."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RequestContext:
    pm_token: str
    project_id: int
    # Storage namespace for the PM instance this request authenticated against
    # (contextspec/<instance_id>/<project_id>/…). Derived server-side from the
    # validated anchor URL — see deps.get_request_context.
    instance_id: str = "default"
