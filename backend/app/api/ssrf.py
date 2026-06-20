"""Shared SSRF guards for proxied outbound requests.

Both PM proxies forward server-side requests to user-influenced base URLs —
header overrides and persisted workspace config. Every base URL must pass
these checks regardless of where it came from; validating only the header
path leaves the config path open (set a private URL via POST /workspace/config,
then reach it through the proxy).
"""

import ipaddress
import socket
from urllib.parse import urlparse

# RFC-1918, loopback, link-local, CGNAT, IPv6 ULA
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
]


def _is_blocked_addr(value: str) -> bool:
    try:
        addr = ipaddress.ip_address(value.split("%")[0])  # strip IPv6 zone id
    except ValueError:
        return False
    # Unwrap IPv4-mapped IPv6 (::ffff:a.b.c.d) and judge the embedded IPv4 by the
    # IPv4 rules. getaddrinfo inside dual-stack containers returns mapped forms of
    # PUBLIC IPv4s (e.g. ::ffff:45.84.208.140) — blanket-blocking the whole mapped
    # range would reject legitimate public hosts (caused a local Docker 400 on
    # Taiga Cloud sign-in). The mapped form of a private IPv4 still resolves to a
    # blocked IPv4 net, so loopback/RFC-1918 stay blocked.
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
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


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host.split("%")[0])
        return True
    except ValueError:
        return False


def pin_host(host: str) -> str | None:
    """Resolve host and return one non-blocked IP literal to connect to.

    Returns None when the host does not resolve (let the connection fail
    naturally — same lenient stance as is_blocked_host on resolver hiccups).
    Raises ValueError when it resolves ONLY to blocked addresses — a
    DNS-rebinding attempt that flipped a public name to a private IP after the
    initial validation.
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return None
    ips = [info[4][0] for info in infos]
    allowed = [ip for ip in ips if not _is_blocked_addr(ip)]
    if not ips:
        return None
    if not allowed:
        raise ValueError(f"{host} resolves only to blocked/private addresses")
    return allowed[0]


def pinned_target(url: str, headers: dict) -> tuple[str, dict, dict]:
    """Pin a validated outbound URL to a resolved non-blocked IP.

    Returns (pinned_url, headers, extensions): the URL host is rewritten to a
    concrete IP, `Host` is set to the original hostname, and `sni_hostname` is
    passed so TLS SNI + certificate verification still use the hostname. This
    closes the DNS-rebinding TOCTOU where the SSRF check and the actual httpx
    connect re-resolve independently.

    Hosts that are already IP literals (or that don't resolve) are returned
    unchanged. Raises ValueError if the host now resolves only to blocked IPs.
    """
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if not host or _is_ip_literal(host):
        return url, headers, {}
    ip = pin_host(host)  # may raise ValueError on a rebinding attempt
    if ip is None:
        return url, headers, {}
    netloc = f"[{ip}]" if ":" in ip else ip
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    pinned_url = parsed._replace(netloc=netloc).geturl()
    return pinned_url, {**headers, "Host": host}, {"sni_hostname": host}
