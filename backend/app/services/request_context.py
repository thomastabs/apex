"""Request context passed from API routes into backend services."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RequestContext:
    taiga_token: str
    project_id: int
