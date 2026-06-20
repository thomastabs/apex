"""X-Forwarded-For parsing — must not trust the spoofable leftmost hop.

A proxy appends the address it received the request from, so the real client is
the Nth entry from the RIGHT (N = trusted proxy hops). Reading the leftmost hop
let an attacker forge a fresh IP per request and bypass every per-IP limit.
"""

from types import SimpleNamespace

from backend.app.api import rate_limit


def _req(xff: str | None = None, peer: str = "203.0.113.9"):
    headers = {}
    if xff is not None:
        headers["x-forwarded-for"] = xff
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=peer))


def test_ignores_spoofed_leftmost_hop(monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXY_HOPS", raising=False)  # default = 1 hop
    # Attacker prepends fake hops; the ingress appended the real client last.
    r = _req("6.6.6.6, 1.2.3.4, 198.51.100.7")
    assert rate_limit._client_ip(r) == "198.51.100.7"


def test_single_hop_returns_that_hop(monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXY_HOPS", raising=False)
    assert rate_limit._client_ip(_req("198.51.100.7")) == "198.51.100.7"


def test_respects_trusted_hops_env(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "2")
    # Two trusted proxies append the rightmost two hops; the real client is the
    # Nth-from-right = parts[-2]. Leftmost entries are attacker-prefixed and ignored.
    r = _req("6.6.6.6, 198.51.100.7, 10.0.0.1, 10.0.0.2")
    assert rate_limit._client_ip(r) == "10.0.0.1"


def test_falls_back_to_peer_when_chain_shorter_than_expected(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "3")
    # Only one XFF entry but 3 hops expected → don't trust it; use the socket peer.
    assert rate_limit._client_ip(_req("1.2.3.4", peer="203.0.113.9")) == "203.0.113.9"


def test_no_xff_uses_socket_peer(monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXY_HOPS", raising=False)
    assert rate_limit._client_ip(_req(None, peer="203.0.113.9")) == "203.0.113.9"
