"""FastAPI dependencies shared by API routers."""

from fastapi import Header, HTTPException, status

from backend.app.services.request_context import RequestContext
from dataclasses import dataclass


@dataclass(frozen=True)
class AuthContext:
    taiga_token: str


def get_auth_context(
    authorization: str = Header(default="", alias="Authorization"),
) -> AuthContext:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization: Bearer <taiga_token> header is required.",
        )
    return AuthContext(taiga_token=token.strip())


def get_request_context(
    authorization: str = Header(default="", alias="Authorization"),
    project_id: int | None = Header(default=None, alias="X-Taiga-Project-Id"),
) -> RequestContext:
    if project_id is None or project_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Taiga-Project-Id header is required.",
        )
    auth = get_auth_context(authorization)
    return RequestContext(taiga_token=auth.taiga_token, project_id=project_id)
