"""Tests for Plane Pages wiki-sync helpers (the Plane equivalent of
taiga_wiki_service.py) — see plane_wiki_service's module docstring for the
documented Plane API asymmetries (no update endpoint, no slug, HTML content)
this module's behavior is built around."""

import html

from backend.app.services import plane_wiki_service as svc

_BASE = "https://api.plane.so/api/v1"
_WORKSPACE = "myteam"
_PROJECT = "7"
_PAGES_URL = f"{_BASE}/workspaces/{_WORKSPACE}/projects/{_PROJECT}/pages"


def _list_url() -> str:
    return f"{_PAGES_URL}/?per_page={svc._PAGE_SIZE}"


def _item_url(page_id: str) -> str:
    return f"{_PAGES_URL}/{page_id}"


def _create_url() -> str:
    return f"{_PAGES_URL}/"


# --------------------------------------------------------------------------
# status()
# --------------------------------------------------------------------------


def test_status_matches_existing_page_by_exact_title_and_fetches_chars(monkeypatch):
    calls = []

    def fake_request(method, url, api_key, *, json=None, ignore_status=frozenset()):
        calls.append((method, url))
        if method == "GET" and url == _list_url():
            return {
                "results": [
                    {"id": "11", "name": "Apex: Project Concept", "updated_at": "2026-08-11T00:00:00Z"},
                ],
            }
        if method == "GET" and url == _item_url("11"):
            return {"id": "11", "name": "Apex: Project Concept", "description_html": "<pre>hello</pre>"}
        raise AssertionError(f"unexpected call {method} {url}")

    monkeypatch.setattr(svc, "_request", fake_request)

    pages = svc.status(
        _BASE, "key", _WORKSPACE, _PROJECT,
        [("project-concept.md", "Project Concept")],
    )

    assert len(pages) == 1
    entry = pages[0]
    assert entry["filename"] == "project-concept.md"
    assert entry["exists"] is True
    assert entry["wiki_id"] == "11"
    assert entry["chars"] == len("hello")
    assert entry["source"] == "apex"
    assert entry["is_custom"] is False
    assert entry["last_modified"] == "2026-08-11T00:00:00Z"
    # One list call + one per-page fetch for the matched page.
    assert calls == [("GET", _list_url()), ("GET", _item_url("11"))]


def test_status_reports_not_exists_for_unmatched_context_file(monkeypatch):
    def fake_request(method, url, api_key, *, json=None, ignore_status=frozenset()):
        if method == "GET" and url == _list_url():
            return {"results": []}
        raise AssertionError(f"unexpected call {method} {url}")

    monkeypatch.setattr(svc, "_request", fake_request)

    pages = svc.status(
        _BASE, "key", _WORKSPACE, _PROJECT,
        [("tech-stack.md", "Technology Choices")],
    )

    assert len(pages) == 1
    entry = pages[0]
    assert entry["exists"] is False
    assert entry["wiki_id"] is None
    assert entry["chars"] == 0


def test_status_surfaces_unmatched_plane_page_as_custom_without_extra_fetch(monkeypatch):
    calls = []

    def fake_request(method, url, api_key, *, json=None, ignore_status=frozenset()):
        calls.append((method, url))
        if method == "GET" and url == _list_url():
            return {
                "results": [
                    {"id": "22", "name": "Random Custom Page", "updated_at": "2026-08-10T00:00:00Z"},
                ],
            }
        raise AssertionError(f"unexpected call {method} {url} (custom pages must not be individually fetched)")

    monkeypatch.setattr(svc, "_request", fake_request)

    pages = svc.status(
        _BASE, "key", _WORKSPACE, _PROJECT,
        [("project-concept.md", "Project Concept")],
    )

    # The known context file reports not-exists; the unmatched Plane page is
    # surfaced separately as a custom entry.
    managed = next(p for p in pages if p["filename"] == "project-concept.md")
    assert managed["exists"] is False

    custom = next(p for p in pages if p["is_custom"])
    assert custom["source"] == "plane"
    assert custom["wiki_id"] == "22"
    assert custom["title"] == "Random Custom Page"
    assert custom["chars"] == 0
    assert custom["slug"] == svc.wiki_slug_for("Random Custom Page")
    assert custom["filename"] == svc.wiki_filename_for_slug(custom["slug"])
    # Only the list call was made — no per-page GET for the custom page.
    assert calls == [("GET", _list_url())]


def test_status_does_not_leak_state_across_independent_calls(monkeypatch):
    # Two separate status() calls (standing in for two different projects)
    # must never share pages — each call only ever reflects what its own
    # _list_pages returned.
    def fake_request_project_a(method, url, api_key, *, json=None, ignore_status=frozenset()):
        if url == _list_url():
            return {"results": [{"id": "1", "name": "Apex: Project Concept"}]}
        return {"id": "1", "name": "Apex: Project Concept", "description_html": "<pre>a</pre>"}

    def fake_request_project_b(method, url, api_key, *, json=None, ignore_status=frozenset()):
        if url == _list_url():
            return {"results": []}
        raise AssertionError("no pages exist for project b")

    monkeypatch.setattr(svc, "_request", fake_request_project_a)
    pages_a = svc.status(_BASE, "key", _WORKSPACE, _PROJECT, [("project-concept.md", "Project Concept")])
    assert pages_a[0]["exists"] is True

    monkeypatch.setattr(svc, "_request", fake_request_project_b)
    pages_b = svc.status(_BASE, "key", _WORKSPACE, _PROJECT, [("project-concept.md", "Project Concept")])
    assert pages_b[0]["exists"] is False


# --------------------------------------------------------------------------
# publish()
# --------------------------------------------------------------------------


def test_publish_creates_new_page_with_wrapped_escaped_content(monkeypatch):
    calls = []
    content = "line one\n<tag> & \"quoted\" 'stuff'"

    def fake_request(method, url, api_key, *, json=None, ignore_status=frozenset()):
        calls.append((method, url, json))
        if method == "GET" and url == _list_url():
            return {"results": []}
        if method == "POST" and url == _create_url():
            return {"id": "99"}
        raise AssertionError(f"unexpected call {method} {url}")

    monkeypatch.setattr(svc, "_request", fake_request)

    results = svc.publish(
        _BASE, "key", _WORKSPACE, _PROJECT,
        [("project-concept.md", "Project Concept", content)],
    )

    assert results == [
        {"filename": "project-concept.md", "slug": svc.wiki_slug_for("project-concept.md"), "action": "created", "ok": True, "detail": ""},
    ]
    post_call = next(c for c in calls if c[0] == "POST")
    assert post_call[2]["name"] == "Apex: Project Concept"
    expected_wrapped = f"<pre>{html.escape(content)}</pre>"
    assert post_call[2]["description_html"] == expected_wrapped
    # Round-trip: unwrapping the exact payload sent recovers the original.
    assert svc._unwrap_markdown(post_call[2]["description_html"]) == content


def test_publish_reports_unsupported_update_for_existing_page_no_write_call(monkeypatch):
    calls = []

    def fake_request(method, url, api_key, *, json=None, ignore_status=frozenset()):
        calls.append((method, url))
        if method == "GET" and url == _list_url():
            return {"results": [{"id": "11", "name": "Apex: Project Concept"}]}
        raise AssertionError(f"unexpected write call {method} {url}")

    monkeypatch.setattr(svc, "_request", fake_request)

    results = svc.publish(
        _BASE, "key", _WORKSPACE, _PROJECT,
        [("project-concept.md", "Project Concept", "new content")],
    )

    assert results == [
        {
            "filename": "project-concept.md",
            "slug": svc.wiki_slug_for("project-concept.md"),
            "action": "unsupported_update",
            "ok": False,
            "detail": results[0]["detail"],
        },
    ]
    assert "no page-update endpoint" in results[0]["detail"]
    # Only the read (list) call happened — no PATCH/PUT/POST attempted.
    assert calls == [("GET", _list_url())]
    assert all(method == "GET" for method, _url in calls)


def test_publish_skips_empty_context_file_without_api_call(monkeypatch):
    calls = []

    def fake_request(method, url, api_key, *, json=None, ignore_status=frozenset()):
        calls.append((method, url))
        if method == "GET" and url == _list_url():
            return {"results": []}
        raise AssertionError(f"unexpected write call {method} {url}")

    monkeypatch.setattr(svc, "_request", fake_request)

    results = svc.publish(
        _BASE, "key", _WORKSPACE, _PROJECT,
        [("runtime-spec.md", "Runtime Spec", "   ")],
    )

    assert results == [
        {"filename": "runtime-spec.md", "slug": svc.wiki_slug_for("runtime-spec.md"), "action": "skipped", "ok": True, "detail": "empty context file"},
    ]
    # Only the initial list call happened — nothing else for the skipped file.
    assert calls == [("GET", _list_url())]


# --------------------------------------------------------------------------
# pull()
# --------------------------------------------------------------------------


def test_pull_recovers_exact_content_for_known_wiki_id(monkeypatch):
    content = "Some spec text with <angle> & \"quotes\"\nsecond line"
    wrapped = f"<pre>{html.escape(content)}</pre>"

    def fake_request(method, url, api_key, *, json=None, ignore_status=frozenset()):
        assert method == "GET"
        assert url == _item_url("55")
        return {"id": "55", "description_html": wrapped}

    monkeypatch.setattr(svc, "_request", fake_request)

    results, contents = svc.pull(
        _BASE, "key", _WORKSPACE, _PROJECT,
        [("project-concept.md", "Project Concept", "55")],
    )

    assert contents == {"project-concept.md": content}
    assert results == [
        {"filename": "project-concept.md", "slug": svc.wiki_slug_for("project-concept.md"), "action": "pulled", "ok": True, "detail": ""},
    ]


def test_publish_then_pull_round_trips_content(monkeypatch):
    # End-to-end round trip through the real wrap/unwrap machinery: publish()
    # writes the wrapped payload, pull() reads the same store back and must
    # recover byte-for-byte identical content.
    store: dict[str, dict] = {}
    content = "Round trip <b>content</b> & more\nline2"

    def fake_request(method, url, api_key, *, json=None, ignore_status=frozenset()):
        if method == "GET" and url == _list_url():
            return {"results": list(store.values())}
        if method == "POST" and url == _create_url():
            page_id = "1"
            store[page_id] = {"id": page_id, "name": json["name"], "description_html": json["description_html"]}
            return {"id": page_id}
        if method == "GET" and url == _item_url("1"):
            return dict(store["1"])
        raise AssertionError(f"unexpected call {method} {url}")

    monkeypatch.setattr(svc, "_request", fake_request)

    publish_results = svc.publish(
        _BASE, "key", _WORKSPACE, _PROJECT,
        [("project-concept.md", "Project Concept", content)],
    )
    assert publish_results[0]["action"] == "created"

    _pull_results, contents = svc.pull(
        _BASE, "key", _WORKSPACE, _PROJECT,
        [("project-concept.md", "Project Concept", "1")],
    )

    assert contents == {"project-concept.md": content}


def test_pull_non_apex_page_strips_html_tags_without_raising(monkeypatch):
    raw_html = "<p>Real <strong>Plane</strong> content &amp; more</p>"

    def fake_request(method, url, api_key, *, json=None, ignore_status=frozenset()):
        assert method == "GET"
        return {"id": "77", "description_html": raw_html}

    monkeypatch.setattr(svc, "_request", fake_request)

    results, contents = svc.pull(
        _BASE, "key", _WORKSPACE, _PROJECT,
        [("wiki-custom-page.md", "Custom Page", "77")],
    )

    assert results[0]["ok"] is True
    pulled = contents["wiki-custom-page.md"]
    assert pulled.strip() != ""
    assert "<" not in pulled and ">" not in pulled
    assert "Real" in pulled and "Plane" in pulled and "content" in pulled


def test_pull_missing_wiki_id_reports_missing_and_excluded_from_contents(monkeypatch):
    def fake_request(method, url, api_key, *, json=None, ignore_status=frozenset()):
        raise AssertionError("must not call the API for a missing wiki_id")

    monkeypatch.setattr(svc, "_request", fake_request)

    results, contents = svc.pull(
        _BASE, "key", _WORKSPACE, _PROJECT,
        [("tech-stack.md", "Technology Choices", "")],
    )

    assert results == [
        {"filename": "tech-stack.md", "slug": svc.wiki_slug_for("tech-stack.md"), "action": "missing", "ok": False, "detail": "wiki page not found"},
    ]
    assert contents == {}
