"""Shared SSRF guards for proxied outbound requests.

Both PM proxies forward server-side requests to user-influenced base URLs —
header overrides and persisted workspace config. Every base URL must pass
these checks regardless of where it came from; validating only the header
path leaves the config path open (set a private URL via POST /workspace/config,
then reach it through the proxy).
"""

import ipaddress
import socket

# RFC-1918, loopback, link-local, CGNAT, IPv6 ULA, IPv4-mapped
BLOCKED_NETS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("::ffff:0:0/96"),
]


def _is_blocked_addr(value: str) -> bool:
    try:
        addr = ipaddress.ip_address(value.split("%")[0])  # strip IPv6 zone id
    except ValueError:
        return False
    return any(addr in net for net in BLOCKED_NETS)


def is_blocked_host(host: str) -> bool:
    """True when host is private/loopback — as a literal or via DNS.

    Resolving the hostname closes the DNS-rebinding gap where a public name
    points at a private address. A name that does not resolve is allowed
    through: the proxied request will fail to connect anyway, and blocking on
    resolver hiccups would break offline/CI runs. Residual TOCTOU: the proxied
    request re-resolves, so a rebinding DNS server could still swap records
    between check and use — full mitigation needs resolved-IP pinning.
    """
    host = host.strip().lower().rstrip(".")
    if not host:
        return True
    if host == "localhost" or host.endswith(".localhost"):
        return True
    if _is_blocked_addr(host):
        return True
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    return any(_is_blocked_addr(info[4][0]) for info in infos)
