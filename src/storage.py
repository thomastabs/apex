"""
storage.py — filesystem abstraction for Apex context files.

When AZURE_STORAGE_CONNECTION_STRING is set, all reads/writes go through
Azure File Share (azure-storage-file-share SDK). Otherwise falls back to
local filesystem so CI and no-Azure local dev require zero changes.

Path mapping (Azure mode):
  Local:  contextspec/<project_id>/project-concept.md
  Azure:  <project_id>/project-concept.md   (share root = local contextspec/)

The Container App mounts the share at /app/contextspec, so paths are
already consistent — the share root IS the local contextspec/ directory.

Required env vars (Azure mode only):
  AZURE_STORAGE_CONNECTION_STRING  — Storage account connection string
  AZURE_FILE_SHARE_NAME            — File share name (default: "contextspec")
"""

import logging
import os
from pathlib import Path
from typing import Iterator

# Load .env BEFORE reading the storage env vars below. This module is imported
# very early (context_manager → storage) — often before other modules call
# load_dotenv() — so without this a .env-configured AZURE_STORAGE_CONNECTION_STRING
# is missed and the backend silently falls back to local disk. load_dotenv() does
# not override vars already in the process env, so the Azure deployment (env
# injected, no .env file) is unaffected.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover — dotenv is always in requirements
    pass

_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
_SHARE = os.getenv("AZURE_FILE_SHARE_NAME", "contextspec")
_LOCAL_PREFIX = "contextspec"  # local base dir that maps to the share root
_USE_AZURE = bool(_CONN_STR)
_logger = logging.getLogger("apex.storage")

if _USE_AZURE:
    from azure.storage.fileshare import ShareFileClient, ShareDirectoryClient

try:
    # azure-core ships with azure-storage-file-share (always in requirements);
    # the fallbacks keep this module importable if Azure deps are ever absent.
    from azure.core.exceptions import (
        ResourceExistsError as _AzResourceExistsError,
        ResourceNotFoundError as _AzResourceNotFoundError,
    )
except ImportError:  # pragma: no cover
    class _AzResourceExistsError(Exception):
        pass

    class _AzResourceNotFoundError(Exception):
        pass


# ── Path mapping ──────────────────────────────────────────────────────────────

def _to_azure_path(local_path_str: str) -> str:
    """Strip the local contextspec/ prefix to get the Azure File Share path.

    contextspec             →  ""          (share root)
    contextspec/1234        →  1234        (project dir)
    contextspec/1234/foo.md →  1234/foo.md (project file)
    """
    if local_path_str == _LOCAL_PREFIX:
        return ""
    prefix = _LOCAL_PREFIX + "/"
    if local_path_str.startswith(prefix):
        return local_path_str[len(prefix):]
    return local_path_str


# ── Azure backend ─────────────────────────────────────────────────────────────

def _az_file_client(azure_path: str) -> "ShareFileClient":
    return ShareFileClient.from_connection_string(
        _CONN_STR, share_name=_SHARE, file_path=azure_path
    )


def _az_dir_client(azure_path: str) -> "ShareDirectoryClient":
    return ShareDirectoryClient.from_connection_string(
        _CONN_STR, share_name=_SHARE, directory_path=azure_path
    )


def _az_exists(azure_path: str) -> bool:
    """True/False only for a definitive answer; infrastructure failures raise.

    Swallowing auth/network errors here made a transient Azure failure look
    like "file missing" — and init_context would then overwrite real context
    files with templates (audit H5). Better a loud 500 than silent data loss.
    """
    if not azure_path:
        return True  # share root always exists
    try:
        _az_file_client(azure_path).get_file_properties()
        return True
    except _AzResourceNotFoundError:
        pass
    except Exception as exc:
        _logger.error("_az_exists: file probe failed for %r: %s", azure_path, exc)
        raise
    try:
        _az_dir_client(azure_path).get_directory_properties()
        return True
    except _AzResourceNotFoundError:
        return False
    except Exception as exc:
        _logger.error("_az_exists: directory probe failed for %r: %s", azure_path, exc)
        raise


def _az_read(azure_path: str) -> str:
    stream = _az_file_client(azure_path).download_file()
    return stream.readall().decode("utf-8")


def _az_ensure_dirs(azure_path: str) -> None:
    """Create all ancestor directories in Azure File Share."""
    parent = str(Path(azure_path).parent)
    if parent in (".", ""):
        return  # file is at share root — no directories to create
    parts = Path(parent).parts
    for i in range(1, len(parts) + 1):
        dir_path = "/".join(parts[:i])
        try:
            _az_dir_client(dir_path).create_directory()
        except _AzResourceExistsError:
            pass  # directory already exists — expected


def _az_write(azure_path: str, content: str) -> None:
    _az_ensure_dirs(azure_path)
    _az_file_client(azure_path).upload_file(content.encode("utf-8"))


def _az_delete(azure_path: str, missing_ok: bool = False) -> None:
    try:
        _az_file_client(azure_path).delete_file()
    except _AzResourceNotFoundError:
        # missing_ok only forgives absence — never auth/network failures.
        if not missing_ok:
            raise FileNotFoundError(azure_path)


def _az_mkdir(azure_path: str) -> None:
    """Create directory and all parents in Azure File Share (no-op if empty = share root)."""
    if not azure_path:
        return  # share root always exists
    parts = Path(azure_path).parts
    for i in range(1, len(parts) + 1):
        dir_path = "/".join(parts[:i])
        try:
            _az_dir_client(dir_path).create_directory()
        except _AzResourceExistsError:
            pass  # directory already exists — expected


def _az_iterdir_dirs(azure_path: str) -> "Iterator[StoragePath]":
    """Yield one StoragePath per SUBDIRECTORY in an Azure File Share directory."""
    try:
        dc = _az_dir_client(azure_path)
        for item in dc.list_directories_and_files():
            if item.get("is_directory", False):
                local_path = (
                    f"{_LOCAL_PREFIX}/{azure_path}/{item['name']}"
                    if azure_path
                    else f"{_LOCAL_PREFIX}/{item['name']}"
                )
                yield StoragePath(local_path)
    except _AzResourceNotFoundError:
        return


def _az_rmdir(azure_path: str) -> None:
    """Delete an (empty) directory in the Azure File Share; no-op if absent."""
    if not azure_path:
        return
    try:
        _az_dir_client(azure_path).delete_directory()
    except _AzResourceNotFoundError:
        pass


def _az_iterdir(azure_path: str) -> "Iterator[StoragePath]":
    """Yield one StoragePath per file (not subdirectory) in an Azure File Share directory."""
    try:
        dc = _az_dir_client(azure_path)
        for item in dc.list_directories_and_files():
            if not item.get("is_directory", False):
                # Reconstruct the full local-equivalent path
                local_path = (
                    f"{_LOCAL_PREFIX}/{azure_path}/{item['name']}"
                    if azure_path
                    else f"{_LOCAL_PREFIX}/{item['name']}"
                )
                yield StoragePath(local_path)
    except _AzResourceNotFoundError:
        # Missing directory → empty listing (callers guard with exists() anyway).
        return
    except Exception as exc:
        # Auth/network failures must not masquerade as "directory is empty" —
        # rebuild_story_index would silently drop every artifact-derived flag.
        _logger.error("_az_iterdir failed for path=%r: %s", azure_path, exc)
        raise


# ── StoragePath ───────────────────────────────────────────────────────────────

class StoragePath:
    """pathlib.Path-compatible wrapper — delegates to Azure File Share when configured.

    All Azure SDK calls use the share-relative path (strip local contextspec/ prefix).
    All property access (.name, .suffix, etc.) uses the full local path string.
    """

    def __init__(self, path) -> None:
        self._p = Path(path)

    def __truediv__(self, other: str) -> "StoragePath":
        return StoragePath(self._p / other)

    def __str__(self) -> str:
        return str(self._p)

    def __fspath__(self) -> str:
        return str(self._p)

    def __repr__(self) -> str:
        return f"StoragePath('{self._p}')"

    def __lt__(self, other) -> bool:
        return str(self._p) < str(other)

    def __eq__(self, other) -> bool:
        if isinstance(other, StoragePath):
            return self._p == other._p
        return self._p == Path(other)

    def __hash__(self) -> int:
        return hash(self._p)

    @property
    def name(self) -> str:
        return self._p.name

    @property
    def stem(self) -> str:
        return self._p.stem

    @property
    def suffix(self) -> str:
        return self._p.suffix

    @property
    def parent(self) -> "StoragePath":
        return StoragePath(self._p.parent)

    def _az(self) -> str:
        """Azure share-relative path (strips local contextspec/ prefix)."""
        return _to_azure_path(str(self._p))

    def exists(self) -> bool:
        if _USE_AZURE:
            return _az_exists(self._az())
        return self._p.exists()

    def read_text(self, encoding: str = "utf-8") -> str:
        if _USE_AZURE:
            return _az_read(self._az())
        return self._p.read_text(encoding=encoding)

    def write_text(self, content: str, encoding: str = "utf-8") -> None:
        if _USE_AZURE:
            _az_write(self._az(), content)
        else:
            self._p.parent.mkdir(parents=True, exist_ok=True)
            self._p.write_text(content, encoding=encoding)

    def unlink(self, missing_ok: bool = False) -> None:
        if _USE_AZURE:
            _az_delete(self._az(), missing_ok=missing_ok)
        else:
            self._p.unlink(missing_ok=missing_ok)

    def mkdir(self, parents: bool = False, exist_ok: bool = False) -> None:
        if _USE_AZURE:
            _az_mkdir(self._az())
        else:
            self._p.mkdir(parents=parents, exist_ok=exist_ok)

    def stat(self):
        if _USE_AZURE:
            props = _az_file_client(self._az()).get_file_properties()
            lm = props.get("last_modified")
            # No mtime → use "now" so every read looks fresh and cache layers
            # re-read. A constant 0.0 would satisfy the story-index cache's
            # mtime-equality check forever, serving stale data.
            import time as _time
            mtime = lm.timestamp() if lm else _time.time()
            return type("_AzStat", (), {"st_mtime": mtime})()
        return self._p.stat()

    def iterdir(self) -> "Iterator[StoragePath]":
        if _USE_AZURE:
            return _az_iterdir(self._az())
        return (StoragePath(p) for p in self._p.iterdir())

    def iterdir_dirs(self) -> "Iterator[StoragePath]":
        """Yield only the subdirectories of this directory (both storage modes)."""
        if _USE_AZURE:
            return _az_iterdir_dirs(self._az())
        return (StoragePath(p) for p in self._p.iterdir() if p.is_dir())

    def is_dir(self) -> bool:
        if _USE_AZURE:
            # Azure callers only test entries from iterdir() (files only), so a
            # directory never reaches here; treat unknown as not-a-dir.
            return False
        return self._p.is_dir()

    def rmdir(self) -> None:
        """Remove an empty directory (no-op if already gone)."""
        if _USE_AZURE:
            _az_rmdir(self._az())
        else:
            try:
                self._p.rmdir()
            except FileNotFoundError:
                pass
