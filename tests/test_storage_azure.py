"""Azure-mode error discrimination in src/storage.py (audit H5).

Exercises the _az_* helpers directly with mocked SDK clients — no real Azure.
The invariant: ResourceNotFoundError means "definitively absent"; every other
exception is an infrastructure failure and must raise, never be mistaken for
a missing file (which made init_context overwrite real context files with
templates on transient errors).
"""

from unittest.mock import MagicMock

import pytest

from src import storage
from src.storage import _AzResourceNotFoundError


class _AuthError(Exception):
    """Stand-in for an Azure auth/network failure."""


def _patch_clients(monkeypatch, file_client=None, dir_client=None):
    monkeypatch.setattr(storage, "_az_file_client", lambda p: file_client or MagicMock())
    monkeypatch.setattr(storage, "_az_dir_client", lambda p: dir_client or MagicMock())


# ── _az_exists ──────────────────────────────────────────────────────────────

def test_exists_true_for_file(monkeypatch):
    _patch_clients(monkeypatch, file_client=MagicMock())
    assert storage._az_exists("1/file.md") is True


def test_exists_false_only_on_not_found(monkeypatch):
    fc = MagicMock()
    fc.get_file_properties.side_effect = _AzResourceNotFoundError("no file")
    dc = MagicMock()
    dc.get_directory_properties.side_effect = _AzResourceNotFoundError("no dir")
    _patch_clients(monkeypatch, file_client=fc, dir_client=dc)
    assert storage._az_exists("1/file.md") is False


def test_exists_raises_on_infrastructure_failure(monkeypatch):
    fc = MagicMock()
    fc.get_file_properties.side_effect = _AuthError("credentials expired")
    _patch_clients(monkeypatch, file_client=fc)
    with pytest.raises(_AuthError):
        storage._az_exists("1/file.md")


def test_exists_raises_when_dir_probe_fails(monkeypatch):
    fc = MagicMock()
    fc.get_file_properties.side_effect = _AzResourceNotFoundError("no file")
    dc = MagicMock()
    dc.get_directory_properties.side_effect = _AuthError("network down")
    _patch_clients(monkeypatch, file_client=fc, dir_client=dc)
    with pytest.raises(_AuthError):
        storage._az_exists("1")


def test_share_root_always_exists():
    assert storage._az_exists("") is True


# ── _az_delete ──────────────────────────────────────────────────────────────

def test_delete_missing_ok_swallows_only_not_found(monkeypatch):
    fc = MagicMock()
    fc.delete_file.side_effect = _AzResourceNotFoundError("gone")
    _patch_clients(monkeypatch, file_client=fc)
    storage._az_delete("1/file.md", missing_ok=True)  # no raise


def test_delete_missing_raises_filenotfound(monkeypatch):
    fc = MagicMock()
    fc.delete_file.side_effect = _AzResourceNotFoundError("gone")
    _patch_clients(monkeypatch, file_client=fc)
    with pytest.raises(FileNotFoundError):
        storage._az_delete("1/file.md", missing_ok=False)


def test_delete_infrastructure_failure_raises_even_with_missing_ok(monkeypatch):
    fc = MagicMock()
    fc.delete_file.side_effect = _AuthError("forbidden")
    _patch_clients(monkeypatch, file_client=fc)
    with pytest.raises(_AuthError):
        storage._az_delete("1/file.md", missing_ok=True)


# ── _az_iterdir ─────────────────────────────────────────────────────────────

def test_iterdir_missing_dir_yields_nothing(monkeypatch):
    dc = MagicMock()
    dc.list_directories_and_files.side_effect = _AzResourceNotFoundError("no dir")
    _patch_clients(monkeypatch, dir_client=dc)
    assert list(storage._az_iterdir("1")) == []


def test_iterdir_infrastructure_failure_raises(monkeypatch):
    dc = MagicMock()
    dc.list_directories_and_files.side_effect = _AuthError("throttled")
    _patch_clients(monkeypatch, dir_client=dc)
    with pytest.raises(_AuthError):
        list(storage._az_iterdir("1"))


def test_iterdir_yields_files_not_directories(monkeypatch):
    dc = MagicMock()
    dc.list_directories_and_files.return_value = [
        {"name": "a.md", "is_directory": False},
        {"name": "sub", "is_directory": True},
        {"name": "b.json", "is_directory": False},
    ]
    _patch_clients(monkeypatch, dir_client=dc)
    names = [p.name for p in storage._az_iterdir("1")]
    assert names == ["a.md", "b.json"]
