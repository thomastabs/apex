"""API route tests for migrated workspace FastAPI routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.workspace import login
from backend.app.schemas.workspace import LoginRequest
from src.taiga_adapter import TaigaAPIError


class StubTaigaService:
    def __init__(self, exc: TaigaAPIError | None = None):
        self.exc = exc

    def login(self, username: str, password: str) -> str:
        if self.exc:
            raise self.exc
        return "tok"

    def get_me(self) -> dict:
        return {"id": 1, "username": "tester", "full_name": "Test User", "email": "t@example.com"}


def _patch_service(monkeypatch, exc: TaigaAPIError | None = None):
    monkeypatch.setattr("backend.app.api.workspace.TaigaService", lambda: StubTaigaService(exc))


def test_login_success(monkeypatch):
    _patch_service(monkeypatch)

    response = login(LoginRequest(username="tester", password="secret"))

    assert response["auth_token"] == "tok"
    assert response["me"]["username"] == "tester"


def test_login_invalid_credentials_maps_to_401(monkeypatch):
    exc = TaigaAPIError("POST", "https://api.taiga.io/api/v1/auth", 401, '{"detail":"No active account found"}')
    _patch_service(monkeypatch, exc)

    with pytest.raises(HTTPException) as raised:
        login(LoginRequest(username="tester", password="wrong"))

    assert raised.value.status_code == 401
    assert raised.value.detail == "No active account found"


def test_login_timeout_maps_to_504(monkeypatch):
    exc = TaigaAPIError("POST", "https://api.taiga.io/api/v1/auth", 0, "Request timed out")
    _patch_service(monkeypatch, exc)

    with pytest.raises(HTTPException) as raised:
        login(LoginRequest(username="tester", password="secret"))

    assert raised.value.status_code == 504
    assert raised.value.detail == "Request timed out"


def test_login_upstream_error_maps_to_502(monkeypatch):
    exc = TaigaAPIError("POST", "https://api.taiga.io/api/v1/auth", 503, "service unavailable")
    _patch_service(monkeypatch, exc)

    with pytest.raises(HTTPException) as raised:
        login(LoginRequest(username="tester", password="secret"))

    assert raised.value.status_code == 502
    assert raised.value.detail == "service unavailable"
