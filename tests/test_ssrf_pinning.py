"""DNS-rebinding pin: resolve-and-pin the outbound target to a validated IP so
the SSRF check and the actual connect cannot re-resolve to different addresses
(audit H2)."""

import pytest

from backend.app.api import ssrf, taiga_proxy


def _fake_getaddrinfo(ips):
    return lambda host, *a, **k: [(2, 1, 6, "", (ip, 0)) for ip in ips]


def test_pin_host_returns_public_ip(monkeypatch):
    monkeypatch.setattr(ssrf.socket, "getaddrinfo", _fake_getaddrinfo(["140.82.121.6"]))
    assert ssrf.pin_host("example.com") == "140.82.121.6"


def test_pin_host_raises_when_all_blocked(monkeypatch):
    monkeypatch.setattr(ssrf.socket, "getaddrinfo", _fake_getaddrinfo(["10.0.0.5", "127.0.0.1"]))
    with pytest.raises(ValueError):
        ssrf.pin_host("evil.example.com")


def test_pin_host_picks_allowed_when_mixed(monkeypatch):
    monkeypatch.setattr(ssrf.socket, "getaddrinfo", _fake_getaddrinfo(["10.0.0.5", "140.82.121.6"]))
    assert ssrf.pin_host("h") == "140.82.121.6"


def test_pin_host_none_when_unresolvable(monkeypatch):
    def boom(*a, **k):
        raise OSError("nxdomain")
    monkeypatch.setattr(ssrf.socket, "getaddrinfo", boom)
    assert ssrf.pin_host("nope.invalid") is None


def test_pinned_target_rewrites_host_and_sets_sni(monkeypatch):
    monkeypatch.setattr(ssrf.socket, "getaddrinfo", _fake_getaddrinfo(["203.0.113.7"]))
    url, headers, ext = ssrf.pinned_target(
        "https://taiga.example.com/api/v1/projects?x=1", {"Accept": "application/json"}
    )
    assert url == "https://203.0.113.7/api/v1/projects?x=1"
    assert headers["Host"] == "taiga.example.com"
    assert ext == {"sni_hostname": "taiga.example.com"}


def test_pinned_target_preserves_port(monkeypatch):
    monkeypatch.setattr(ssrf.socket, "getaddrinfo", _fake_getaddrinfo(["203.0.113.7"]))
    url, _, _ = ssrf.pinned_target("https://taiga.example.com:8443/x", {})
    assert url == "https://203.0.113.7:8443/x"


def test_pinned_target_leaves_ip_literal_unchanged():
    url, headers, ext = ssrf.pinned_target("https://203.0.113.7/x", {"a": "b"})
    assert url == "https://203.0.113.7/x"
    assert ext == {}


def test_pinned_target_raises_on_rebind_to_metadata(monkeypatch):
    monkeypatch.setattr(ssrf.socket, "getaddrinfo", _fake_getaddrinfo(["169.254.169.254"]))
    with pytest.raises(ValueError):
        ssrf.pinned_target("https://rebind.example.com/", {})


def test_pin_unless_relayed_skips_relay_path():
    # Relay path connects to Cloudflare (trusted); never pinned.
    url, headers, ext = taiga_proxy._pin_unless_relayed(
        "https://apex-taiga-relay.example.workers.dev/",
        {"X-Relay-Target": "https://api.taiga.io/api/v1/users/me"},
    )
    assert ext == {}
    assert url == "https://apex-taiga-relay.example.workers.dev/"


def test_pin_unless_relayed_blocks_rebind(monkeypatch):
    from fastapi import HTTPException
    monkeypatch.setattr(ssrf.socket, "getaddrinfo", _fake_getaddrinfo(["10.1.2.3"]))
    with pytest.raises(HTTPException) as ei:
        taiga_proxy._pin_unless_relayed("https://taiga.example.com/api/v1/x", {})
    assert ei.value.status_code == 400


# ── Egress allowlist (Next-Level #1, policy half) ───────────────────────────


def test_egress_allowlist_default_allows_all(monkeypatch):
    monkeypatch.delenv("EGRESS_HOST_ALLOWLIST", raising=False)
    assert ssrf.egress_host_allowed("api.taiga.io") is True
    assert ssrf.egress_host_allowed("anything.example.com") is True


def test_egress_allowlist_exact_and_wildcard(monkeypatch):
    monkeypatch.setenv("EGRESS_HOST_ALLOWLIST", "api.taiga.io, *.atlassian.net")
    assert ssrf.egress_host_allowed("api.taiga.io") is True
    assert ssrf.egress_host_allowed("acme.atlassian.net") is True
    assert ssrf.egress_host_allowed("atlassian.net") is True  # *.x matches the apex
    assert ssrf.egress_host_allowed("evil.example.com") is False
    assert ssrf.egress_host_allowed("api.taiga.io.evil.com") is False


def test_validate_taiga_url_rejects_disallowed_host(monkeypatch):
    from fastapi import HTTPException
    monkeypatch.setenv("EGRESS_HOST_ALLOWLIST", "api.taiga.io")
    with pytest.raises(HTTPException) as ei:
        taiga_proxy._validate_taiga_url("https://other-taiga.example.com/api/v1")
    assert ei.value.status_code == 403


def test_validate_taiga_url_allows_listed_host(monkeypatch):
    monkeypatch.setenv("EGRESS_HOST_ALLOWLIST", "api.taiga.io")
    assert taiga_proxy._validate_taiga_url("https://api.taiga.io/api/v1") == "https://api.taiga.io/api/v1"
