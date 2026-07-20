"""Tests for Taiga Wiki context-file sync helpers."""

from backend.app.services import taiga_wiki_service as svc


def test_status_reports_existing_wiki_pages(monkeypatch):
    def fake_request(method, url, token, *, params=None, json=None):
        assert method == "GET"
        return [
            {"id": 10, "slug": "apex-project-concept", "content": "hello", "modified_date": "2026-07-18T10:00:00Z"},
            {"id": 11, "slug": "research-notes", "content": "market", "modified_date": "2026-07-18T11:00:00Z"},
        ]

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
    assert pages[2]["filename"] == "wiki-research-notes.md"
    assert pages[2]["slug"] == "research-notes"
    assert pages[2]["is_custom"] is True
    assert pages[2]["source"] == "taiga"


def test_publish_updates_existing_and_creates_missing(monkeypatch):
    calls = []

    def fake_request(method, url, token, *, params=None, json=None, data=None, files=None):
        calls.append((method, url, json, data, files))
        if method == "GET":
            if url.endswith("/wiki/attachments"):
                object_id = params.get("object_id") if params else None
                return [{"id": 99, "name": "project-concept.md"}] if object_id == 10 else []
            return [{"id": 10, "slug": "apex-project-concept", "content": "", "version": 7}]
        if method == "POST" and url.endswith("/wiki"):
            return {"id": 11}
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
    assert calls[2][0] == "GET"
    assert calls[2][1].endswith("/wiki/attachments")
    assert calls[3][0] == "DELETE"
    assert calls[4][0] == "POST"
    assert calls[4][1].endswith("/wiki/attachments")
    assert calls[4][4]["attached_file"][0] == "project-concept.md"
    assert calls[5][0] == "POST"
    assert calls[5][2] == {"project": 42, "slug": "apex-tech-stack", "content": "stack", "watchers": []}
    assert calls[6][0] == "GET"
    assert calls[6][1].endswith("/wiki/attachments")
    assert calls[7][0] == "POST"
    assert calls[7][4]["attached_file"][0] == "tech-stack.md"


def test_publish_recovers_when_create_reports_duplicate_slug(monkeypatch):
    calls = []
    listed_once = False

    def fake_request(method, url, token, *, params=None, json=None, data=None, files=None):
        nonlocal listed_once
        calls.append((method, url, json, data, files))
        if method == "GET" and url.endswith("/wiki"):
            if not listed_once:
                listed_once = True
                return []
            return [{"id": 44, "slug": "apex-project-concept", "content": "", "version": 3}]
        if method == "POST" and url.endswith("/wiki"):
            raise svc.HTTPException(
                status_code=502,
                detail='Taiga returned 400 for POST https://api.taiga.io/api/v1/wiki: {"_all_": ["Wiki page with this Project and Slug already exists."]}',
            )
        if method == "GET" and url.endswith("/wiki/attachments"):
            return []
        return {"ok": True}

    monkeypatch.setattr(svc, "_request", fake_request)

    results = svc.publish(
        "https://api.taiga.io/api/v1",
        "tok",
        42,
        [("project-concept.md", "Project Concept", "concept")],
    )

    assert results == [
        {"filename": "project-concept.md", "slug": "apex-project-concept", "action": "updated", "ok": True, "detail": ""},
    ]
    assert [call[0] for call in calls] == ["GET", "POST", "GET", "PATCH", "GET", "POST"]
    assert calls[3][2] == {"content": "concept", "version": 3}
    assert calls[5][1].endswith("/wiki/attachments")
    assert calls[5][4]["attached_file"][0] == "project-concept.md"


def test_publish_raises_clean_error_when_conflict_page_never_found(monkeypatch):
    def fake_request(method, url, token, *, params=None, json=None, data=None, files=None):
        if method == "GET" and url.endswith("/wiki"):
            return []
        if method == "POST" and url.endswith("/wiki"):
            raise svc.HTTPException(
                status_code=502,
                detail='Taiga returned 400 for POST https://api.taiga.io/api/v1/wiki: {"_all_": ["Wiki page with this Project and Slug already exists."]}',
            )
        return {"ok": True}

    monkeypatch.setattr(svc, "_request", fake_request)

    try:
        svc.publish(
            "https://api.taiga.io/api/v1",
            "tok",
            42,
            [("project-concept.md", "Project Concept", "concept")],
        )
        raise AssertionError("expected HTTPException")
    except svc.HTTPException as exc:
        assert exc.status_code == 502
        assert "Taiga returned 400" not in str(exc.detail)
        assert "project-concept.md" in str(exc.detail)
        assert "apex-project-concept" in str(exc.detail)


def test_publish_skips_empty_context_files(monkeypatch):
    calls = []

    def fake_request(method, url, token, *, params=None, json=None, data=None, files=None):
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


def test_pull_custom_wiki_page_by_slug(monkeypatch):
    def fake_request(method, url, token, *, params=None, json=None):
        assert method == "GET"
        return [{"id": 12, "slug": "architecture-notes", "content": "custom doc"}]

    monkeypatch.setattr(svc, "_request", fake_request)

    results, contents = svc.pull(
        "https://api.taiga.io/api/v1",
        "tok",
        42,
        [("wiki-architecture-notes.md", "Architecture Notes", "architecture-notes")],
    )

    assert contents == {"wiki-architecture-notes.md": "custom doc"}
    assert results == [
        {"filename": "wiki-architecture-notes.md", "slug": "architecture-notes", "action": "pulled", "ok": True, "detail": ""},
    ]
