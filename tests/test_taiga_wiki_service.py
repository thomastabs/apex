"""Tests for Taiga Wiki context-file sync helpers."""

from backend.app.services import taiga_wiki_service as svc


def test_status_reports_existing_wiki_pages(monkeypatch):
    def fake_request(method, url, token, *, params=None, json=None):
        assert method == "GET"
        return [{"id": 10, "slug": "apex-project-concept", "content": "hello", "modified_date": "2026-07-18T10:00:00Z"}]

    monkeypatch.setattr(svc, "_request", fake_request)

    pages = svc.status(
        "https://api.taiga.io/api/v1",
        "tok",
        42,
        [("project-concept.md", "Project Concept"), ("tech-stack.md", "Technology Choices")],
    )

    assert pages[0]["exists"] is True
    assert pages[0]["wiki_id"] == 10
    assert pages[0]["chars"] == 5
    assert pages[1]["exists"] is False
    assert pages[1]["slug"] == "apex-tech-stack"


def test_publish_updates_existing_and_creates_missing(monkeypatch):
    calls = []

    def fake_request(method, url, token, *, params=None, json=None):
        calls.append((method, url, json))
        if method == "GET":
            return [{"id": 10, "slug": "apex-project-concept", "content": "", "version": 7}]
        return {"ok": True}

    monkeypatch.setattr(svc, "_request", fake_request)

    results = svc.publish(
        "https://api.taiga.io/api/v1",
        "tok",
        42,
        [("project-concept.md", "Project Concept", "concept"), ("tech-stack.md", "Technology Choices", "stack")],
    )

    assert results == [
        {"filename": "project-concept.md", "slug": "apex-project-concept", "action": "updated", "ok": True, "detail": ""},
        {"filename": "tech-stack.md", "slug": "apex-tech-stack", "action": "created", "ok": True, "detail": ""},
    ]
    assert calls[1][0] == "PATCH"
    assert calls[1][2] == {"content": "concept", "version": 7}
    assert calls[2][0] == "POST"
    assert calls[2][2] == {"project": 42, "slug": "apex-tech-stack", "content": "stack", "watchers": []}


def test_publish_skips_empty_context_files(monkeypatch):
    calls = []

    def fake_request(method, url, token, *, params=None, json=None):
        calls.append((method, url, json))
        if method == "GET":
            return []
        return {"ok": True}

    monkeypatch.setattr(svc, "_request", fake_request)

    results = svc.publish(
        "https://api.taiga.io/api/v1",
        "tok",
        42,
        [("runtime-spec.md", "Runtime Spec", "   ")],
    )

    assert results == [
        {"filename": "runtime-spec.md", "slug": "apex-runtime-spec", "action": "skipped", "ok": True, "detail": "empty context file"},
    ]
    assert len(calls) == 1


def test_pull_returns_matching_contents(monkeypatch):
    def fake_request(method, url, token, *, params=None, json=None):
        assert method == "GET"
        return [{"id": 10, "slug": "apex-project-concept", "content": "from wiki"}]

    monkeypatch.setattr(svc, "_request", fake_request)

    results, contents = svc.pull(
        "https://api.taiga.io/api/v1",
        "tok",
        42,
        [("project-concept.md", "Project Concept"), ("tech-stack.md", "Technology Choices")],
    )

    assert contents == {"project-concept.md": "from wiki"}
    assert results[0]["action"] == "pulled"
    assert results[1]["action"] == "missing"
    assert results[1]["ok"] is False
