"""
storage.py — filesystem abstraction for Apex context files.

When AZURE_STORAGE_CONNECTION_STRING is set, all reads/writes go through
Azure File Share (azure-storage-file-share SDK). Otherwise falls back to
local filesystem so CI and no-Azure local dev require zero changes.

Path mapping (Azure mode):
  Local:  contextspec/<project_id>/memory-bank.md
  Azure:  <project_id>/memory-bank.md   (share root = local contextspec/)

The Container App mounts the share at /app/contextspec, so paths are
already consistent — the share root IS the local contextspec/ directory.

Required env vars (Azure mode only):
  AZURE_STORAGE_CONNECTION_STRING  — Storage account connection string
  AZURE_FILE_SHARE_NAME            — File share name (default: "contextspec")
"""

import os
from pathlib import Path
from typing import Iterator

_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
_SHARE = os.getenv("AZURE_FILE_SHARE_NAME", "contextspec")
_LOCAL_PREFIX = "contextspec"  # local base dir that maps to the share root
_USE_AZURE = bool(_CONN_STR)

if _USE_AZURE:
    from azure.storage.fileshare import ShareFileClient, ShareDirectoryClient


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
    if not azure_path:
        return True  # share root always exists
    try:
        _az_file_client(azure_path).get_file_properties()
        return True
    except Exception:
        pass
    try:
        _az_dir_client(azure_path).get_directory_properties()
        return True
    except Exception:
        return False


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
        except Exception:
            pass  # already exists


def _az_write(azure_path: str, content: str) -> None:
    _az_ensure_dirs(azure_path)
    _az_file_client(azure_path).upload_file(content.encode("utf-8"))


def _az_delete(azure_path: str, missing_ok: bool = False) -> None:
    try:
        _az_file_client(azure_path).delete_file()
    except Exception:
        if not missing_ok:
            raise


def _az_mkdir(azure_path: str) -> None:
    """Create directory and all parents in Azure File Share (no-op if empty = share root)."""
    if not azure_path:
        return  # share root always exists
    parts = Path(azure_path).parts
    for i in range(1, len(parts) + 1):
        dir_path = "/".join(parts[:i])
        try:
            _az_dir_client(dir_path).create_directory()
        except Exception:
            pass  # already exists


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
    except Exception:
        return


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

    def iterdir(self) -> "Iterator[StoragePath]":
        if _USE_AZURE:
            return _az_iterdir(self._az())
        return (StoragePath(p) for p in self._p.iterdir())
