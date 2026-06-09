"""FastAPI dependencies shared by API routers."""

from fastapi import Header, HTTPException, status

from backend.app.services.request_context import RequestContext
from dataclasses import dataclass


@dataclass(frozen=True)
class AuthContext:
    pm_token: str


_MAX_TOKEN_LEN = 2_000


def get_auth_context(
    authorization: str = Header(default="", alias="Authorization"),
) -> AuthContext:
    if "\r" in authorization or "\n" in authorization:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid authorization header.",
        )
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization: Bearer <token> header is required.",
        )
    if len(token) > _MAX_TOKEN_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid authorization token.",
        )
    return AuthContext(pm_token=token)


def get_request_context(
    authorization: str = Header(default="", alias="Authorization"),
    project_id_new: int | None = Header(default=None, alias="X-Project-Id"),
    project_id_legacy: int | None = Header(default=None, alias="X-Taiga-Project-Id"),
) -> RequestContext:
    raw = project_id_new if isinstance(project_id_new, int) else (project_id_legacy if isinstance(project_id_legacy, int) else None)
    project_id: int | None = raw
    if project_id is None or project_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Project-Id header is required.",
        )
    auth = get_auth_context(authorization)
    return RequestContext(pm_token=auth.pm_token, project_id=project_id)
