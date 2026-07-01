"""
ai_key_store.py
Encrypted, per-PM-account storage for user-supplied AI provider API keys
(OpenAI/Google/Anthropic).

A key saved here follows the user across browser sessions and devices — it is
keyed by (PM instance, PM account id), never by browser session, so signing
into the same Taiga/Jira account from anywhere finds the same saved key. This
is the opposite tradeoff from the GitHub PAT / Figma token, which are
deliberately kept client-side-only; AI provider keys are persisted because
users asked to not have to re-enter them.

Storage lives under contextspec/<instance_id>/.ai-keys.json, alongside the
other per-instance data context_manager.py manages (github_repo,
figma_file_key) — see context_manager._instance_dir().

Encryption: requires AI_KEY_ENCRYPTION_SECRET in the environment. save_key()
raises rather than ever writing a key in plaintext when it is unset.
"""

import base64
import hashlib
import json
import logging
import os
import threading
import time

from src import distributed
from src.storage import StoragePath as Path

_logger = logging.getLogger("apex.ai_key_store")

_BASE_CONTEXTSPEC = Path("contextspec")
_FILE_NAME = ".ai-keys.json"

PROVIDERS = ("openai", "google", "anthropic")

# Decrypted keys are cached in-process only (never re-serialised) for a short
# window so a busy session doesn't re-read-and-decrypt on every request.
_DECRYPTED_CACHE_TTL = 30.0
_cache_lock = threading.Lock()
_decrypted_cache: dict[tuple[str, str], tuple[float, dict[str, str]]] = {}


def _write_lock():
    """Serialise read-modify-write of a single instance's key file. Process-local
    by default; a reentrant cross-replica lock when REDIS_URL is set (src/distributed)."""
    return distributed.reentrant_lock("apex:ai-key-store-write")


def _fernet():
    """Build a Fernet cipher from AI_KEY_ENCRYPTION_SECRET, or None if unset.

    Any string is accepted and stretched into a valid 32-byte Fernet key via
    SHA-256 — operators don't need to generate a key in Fernet's own base64
    format, just set a long random secret.
    """
    secret = os.getenv("AI_KEY_ENCRYPTION_SECRET", "").strip()
    if not secret:
        return None
    from cryptography.fernet import Fernet

    derived = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(derived)


def encryption_configured() -> bool:
    return _fernet() is not None


def _path(instance_id: str) -> Path:
    return _BASE_CONTEXTSPEC / (instance_id or "default")


def _read_all(instance_id: str) -> dict:
    p = _path(instance_id) / _FILE_NAME
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        _logger.warning("ai_key_store: failed to read %s: %s", p, exc)
        return {}


def _write_all(instance_id: str, data: dict) -> None:
    inst_dir = _path(instance_id)
    inst_dir.mkdir(parents=True, exist_ok=True)
    (inst_dir / _FILE_NAME).write_text(json.dumps(data, indent=2), encoding="utf-8")


def _invalidate_cache(instance_id: str, account_id: str) -> None:
    with _cache_lock:
        _decrypted_cache.pop((instance_id, str(account_id)), None)


def save_key(instance_id: str, account_id: str, provider: str, api_key: str) -> None:
    """Encrypt and persist *api_key* for (instance_id, account_id, provider).

    Raises ValueError for an unknown provider, RuntimeError if
    AI_KEY_ENCRYPTION_SECRET is not configured — a key must never be written
    to disk in plaintext.
    """
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider!r}")
    if not account_id:
        raise ValueError("account_id is required")
    fernet = _fernet()
    if fernet is None:
        raise RuntimeError("AI_KEY_ENCRYPTION_SECRET is not configured on this deployment.")
    token = fernet.encrypt(api_key.encode("utf-8")).decode("ascii")
    with _write_lock():
        data = _read_all(instance_id)
        account = data.setdefault(str(account_id), {})
        account[provider] = token
        _write_all(instance_id, data)
    _invalidate_cache(instance_id, account_id)


def delete_key(instance_id: str, account_id: str, provider: str) -> None:
    """Remove a saved key. No-op if nothing was saved for this provider/account."""
    with _write_lock():
        data = _read_all(instance_id)
        account = data.get(str(account_id))
        if account and provider in account:
            del account[provider]
            if not account:
                data.pop(str(account_id), None)
            _write_all(instance_id, data)
    _invalidate_cache(instance_id, account_id)


def saved_providers(instance_id: str, account_id: str) -> list[str]:
    """Which providers have a saved key for this account — cheap existence
    check, no decryption needed. Returns [] for an empty/unknown account_id."""
    if not account_id:
        return []
    return sorted(_read_all(instance_id).get(str(account_id), {}).keys())


def load_keys(instance_id: str, account_id: str) -> dict[str, str]:
    """Decrypt and return {provider: api_key} for this account.

    Best-effort: a corrupted or undecryptable entry (e.g. AI_KEY_ENCRYPTION_SECRET
    rotated since it was saved) is skipped rather than raised, and an unset
    AI_KEY_ENCRYPTION_SECRET simply yields no keys — callers fall back to the
    deployment's env-var keys either way.
    """
    if not account_id:
        return {}
    cache_key = (instance_id, str(account_id))
    with _cache_lock:
        hit = _decrypted_cache.get(cache_key)
        if hit is not None and hit[0] > time.monotonic():
            return hit[1]

    fernet = _fernet()
    if fernet is None:
        return {}
    raw = _read_all(instance_id).get(str(account_id), {})
    result: dict[str, str] = {}
    for provider, token in raw.items():
        try:
            result[provider] = fernet.decrypt(token.encode("ascii")).decode("utf-8")
        except Exception as exc:  # noqa: BLE001 — corrupted/foreign entry, skip don't crash
            _logger.warning("ai_key_store: could not decrypt saved %s key: %s", provider, exc)

    with _cache_lock:
        _decrypted_cache[cache_key] = (time.monotonic() + _DECRYPTED_CACHE_TTL, result)
    return result
