"""Encrypted, per-PM-account AI provider key storage (src/ai_key_store.py)."""

import pytest

from src import ai_key_store


@pytest.fixture(autouse=True)
def _isolated_store(tmp_path, monkeypatch):
    """Redirect storage to a tmp dir and a fixed encryption secret, and clear
    the in-process decrypted-key cache so tests never bleed into each other."""
    from src.storage import StoragePath

    monkeypatch.setattr(ai_key_store, "_BASE_CONTEXTSPEC", StoragePath(str(tmp_path / "contextspec")))
    monkeypatch.setenv("AI_KEY_ENCRYPTION_SECRET", "test-secret-do-not-use-in-prod")
    ai_key_store._decrypted_cache.clear()
    yield
    ai_key_store._decrypted_cache.clear()


class TestEncryptionConfigured:
    def test_true_when_secret_set(self):
        assert ai_key_store.encryption_configured() is True

    def test_false_when_secret_unset(self, monkeypatch):
        monkeypatch.delenv("AI_KEY_ENCRYPTION_SECRET", raising=False)
        assert ai_key_store.encryption_configured() is False


class TestSaveAndLoad:
    def test_round_trip(self):
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-my-secret-key")
        assert ai_key_store.load_keys("api_taiga_io", "42") == {"openai": "sk-my-secret-key"}

    def test_multiple_providers_same_account(self):
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-openai-key")
        ai_key_store.save_key("api_taiga_io", "42", "google", "AIza-google-key")
        keys = ai_key_store.load_keys("api_taiga_io", "42")
        assert keys == {"openai": "sk-openai-key", "google": "AIza-google-key"}

    def test_different_accounts_isolated(self):
        ai_key_store.save_key("api_taiga_io", "alice", "openai", "sk-alices-key")
        ai_key_store.save_key("api_taiga_io", "bob", "openai", "sk-bobs-key")
        assert ai_key_store.load_keys("api_taiga_io", "alice") == {"openai": "sk-alices-key"}
        assert ai_key_store.load_keys("api_taiga_io", "bob") == {"openai": "sk-bobs-key"}

    def test_different_instances_isolated(self):
        # Same account id, two different Taiga/Jira hosts — must not collide.
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-cloud-key")
        ai_key_store.save_key("acme_atlassian_net", "42", "openai", "sk-jira-key")
        assert ai_key_store.load_keys("api_taiga_io", "42") == {"openai": "sk-cloud-key"}
        assert ai_key_store.load_keys("acme_atlassian_net", "42") == {"openai": "sk-jira-key"}

    def test_unknown_account_returns_empty(self):
        assert ai_key_store.load_keys("api_taiga_io", "nobody") == {}

    def test_saving_replaces_existing_key(self):
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-old-key")
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-new-key")
        assert ai_key_store.load_keys("api_taiga_io", "42") == {"openai": "sk-new-key"}

    def test_stored_at_rest_is_not_plaintext(self):
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-plaintext-marker")
        raw = ai_key_store._read_all("api_taiga_io")
        assert "sk-plaintext-marker" not in raw["42"]["openai"]

    def test_unknown_provider_rejected(self):
        with pytest.raises(ValueError):
            ai_key_store.save_key("api_taiga_io", "42", "not-a-real-provider", "sk-x")

    def test_save_without_secret_raises_and_writes_nothing(self, monkeypatch):
        monkeypatch.delenv("AI_KEY_ENCRYPTION_SECRET", raising=False)
        with pytest.raises(RuntimeError):
            ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-should-not-be-written")
        assert ai_key_store.load_keys("api_taiga_io", "42") == {}

    def test_load_without_secret_returns_empty_without_raising(self, monkeypatch):
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-my-secret-key")
        ai_key_store._decrypted_cache.clear()
        monkeypatch.delenv("AI_KEY_ENCRYPTION_SECRET", raising=False)
        assert ai_key_store.load_keys("api_taiga_io", "42") == {}

    def test_load_with_rotated_secret_skips_undecryptable_entry(self, monkeypatch):
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-my-secret-key")
        ai_key_store._decrypted_cache.clear()
        monkeypatch.setenv("AI_KEY_ENCRYPTION_SECRET", "a-completely-different-secret")
        assert ai_key_store.load_keys("api_taiga_io", "42") == {}

    def test_load_is_cached_until_invalidated(self, monkeypatch):
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-cached-key")
        assert ai_key_store.load_keys("api_taiga_io", "42") == {"openai": "sk-cached-key"}
        # Corrupt the on-disk data directly (bypassing save_key) — the cached
        # decrypted value should still be served until the cache is invalidated.
        ai_key_store._write_all("api_taiga_io", {})
        assert ai_key_store.load_keys("api_taiga_io", "42") == {"openai": "sk-cached-key"}


class TestDeleteKey:
    def test_delete_removes_provider(self):
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-x")
        ai_key_store.save_key("api_taiga_io", "42", "google", "AIza-y")
        ai_key_store.delete_key("api_taiga_io", "42", "openai")
        assert ai_key_store.load_keys("api_taiga_io", "42") == {"google": "AIza-y"}

    def test_delete_last_provider_removes_account_entry(self):
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-x")
        ai_key_store.delete_key("api_taiga_io", "42", "openai")
        raw = ai_key_store._read_all("api_taiga_io")
        assert "42" not in raw

    def test_delete_nonexistent_is_a_noop(self):
        ai_key_store.delete_key("api_taiga_io", "42", "openai")  # must not raise
        assert ai_key_store.load_keys("api_taiga_io", "42") == {}

    def test_delete_invalidates_cache(self):
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-x")
        assert ai_key_store.load_keys("api_taiga_io", "42") == {"openai": "sk-x"}
        ai_key_store.delete_key("api_taiga_io", "42", "openai")
        assert ai_key_store.load_keys("api_taiga_io", "42") == {}


class TestSavedProviders:
    def test_lists_providers_without_decrypting(self, monkeypatch):
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-x")
        ai_key_store.save_key("api_taiga_io", "42", "anthropic", "sk-ant-y")
        # Even with no encryption secret at all, existence-checking must still work —
        # it only reads the raw JSON, never calls Fernet.
        monkeypatch.delenv("AI_KEY_ENCRYPTION_SECRET", raising=False)
        assert ai_key_store.saved_providers("api_taiga_io", "42") == ["anthropic", "openai"]

    def test_empty_account_id_returns_empty_list(self):
        assert ai_key_store.saved_providers("api_taiga_io", "") == []

    def test_unknown_account_returns_empty_list(self):
        assert ai_key_store.saved_providers("api_taiga_io", "nobody") == []
