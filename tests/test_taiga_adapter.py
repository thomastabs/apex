"""Unit tests for taiga_adapter.py — pure helper functions and retry logic (no real network calls)."""

import pytest
from unittest.mock import patch, MagicMock, call


# ---------------------------------------------------------------------------
# _web_base_url
# ---------------------------------------------------------------------------

class TestWebBaseUrl:
    def _url(self, api_url: str) -> str:
        from src import taiga_adapter
        with patch.object(taiga_adapter, "TAIGA_API_URL", api_url):
            return taiga_adapter._web_base_url()

    def test_taiga_cloud_strips_api_subdomain(self):
        assert self._url("https://api.taiga.io") == "https://taiga.io"

    def test_self_hosted_no_api_subdomain_unchanged(self):
        assert self._url("https://taiga.example.com") == "https://taiga.example.com"

    def test_strips_api_v1_path_suffix(self):
        assert self._url("https://taiga.example.com/api/v1") == "https://taiga.example.com"

    def test_strips_api_path_suffix(self):
        assert self._url("https://taiga.example.com/api") == "https://taiga.example.com"

    def test_trailing_slash_handled(self):
        result = self._url("https://api.taiga.io/")
        assert "api." not in result


# ---------------------------------------------------------------------------
# get_story_url
# ---------------------------------------------------------------------------

class TestGetStoryUrl:
    def test_returns_none_when_ref_is_none(self):
        from src import taiga_adapter
        assert taiga_adapter.get_story_url(None) is None

    def test_returns_none_when_project_has_no_slug(self):
        from src import taiga_adapter
        with patch.object(taiga_adapter, "get_project", return_value={}):
            result = taiga_adapter.get_story_url(42)
        assert result is None

    def test_builds_correct_url(self):
        from src import taiga_adapter
        with (
            patch.object(taiga_adapter, "get_project", return_value={"slug": "my-project"}),
            patch.object(taiga_adapter, "TAIGA_API_URL", "https://api.taiga.io"),
        ):
            result = taiga_adapter.get_story_url(42)
        assert result == "https://taiga.io/project/my-project/us/42"

    def test_self_hosted_url(self):
        from src import taiga_adapter
        with (
            patch.object(taiga_adapter, "get_project", return_value={"slug": "proj"}),
            patch.object(taiga_adapter, "TAIGA_API_URL", "https://taiga.acme.com"),
        ):
            result = taiga_adapter.get_story_url(7)
        assert result == "https://taiga.acme.com/project/proj/us/7"

    def test_returns_none_on_exception(self):
        from src import taiga_adapter
        with patch.object(taiga_adapter, "get_project", side_effect=Exception("boom")):
            result = taiga_adapter.get_story_url(1)
        assert result is None


# ---------------------------------------------------------------------------
# is_configured
# ---------------------------------------------------------------------------

class TestIsConfigured:
    def test_true_when_token_present(self):
        from src import taiga_adapter
        with patch.dict(taiga_adapter._token, {"value": "mytoken"}):
            assert taiga_adapter.is_configured() is True

    def test_true_when_username_and_password_present(self):
        from src import taiga_adapter
        with (
            patch.dict(taiga_adapter._token, {"value": ""}),
            patch.object(taiga_adapter, "TAIGA_USERNAME", "user"),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", "pass"),
        ):
            assert taiga_adapter.is_configured() is True

    def test_false_when_nothing_configured(self):
        from src import taiga_adapter
        with (
            patch.dict(taiga_adapter._token, {"value": ""}),
            patch.object(taiga_adapter, "TAIGA_USERNAME", ""),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", ""),
        ):
            assert taiga_adapter.is_configured() is False


# ---------------------------------------------------------------------------
# _request retry / back-off behaviour
# ---------------------------------------------------------------------------

class TestRequestRetry:
    """Verify retry logic without hitting the real network."""

    def _resp(self, status: int, body: dict | None = None) -> MagicMock:
        r = MagicMock()
        r.status_code = status
        r.ok = status < 400
        r.content = b"{}" if body is not None else b""
        r.text = str(body or "error")
        r.json.return_value = body or {}
        return r

    def _get(self, responses, *, token="tok", api_url="https://taiga.example.com"):
        from src import taiga_adapter
        with (
            patch.dict(taiga_adapter._token, {"value": token}),
            patch.object(taiga_adapter, "TAIGA_API_URL", api_url),
            patch.object(taiga_adapter, "TAIGA_USERNAME", ""),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", ""),
            patch("src.taiga_adapter.requests.get", side_effect=responses) as mock_get,
            patch("src.taiga_adapter.time.sleep") as mock_sleep,
        ):
            return taiga_adapter._get("projects/1"), mock_get, mock_sleep

    def test_retries_once_on_429_then_succeeds(self):
        result, mock_get, mock_sleep = self._get([
            self._resp(429),
            self._resp(200, {"id": 1}),
        ])
        assert result == {"id": 1}
        assert mock_get.call_count == 2
        mock_sleep.assert_called_once_with(1.0)

    def test_retries_once_on_503_then_succeeds(self):
        result, mock_get, mock_sleep = self._get([
            self._resp(503),
            self._resp(200, {"id": 2}),
        ])
        assert result == {"id": 2}
        assert mock_get.call_count == 2
        mock_sleep.assert_called_once_with(1.0)

    def test_exponential_backoff_on_two_retries(self):
        result, mock_get, mock_sleep = self._get([
            self._resp(503),
            self._resp(503),
            self._resp(200, {"ok": True}),
        ])
        assert result == {"ok": True}
        assert mock_get.call_count == 3
        assert mock_sleep.call_count == 2
        mock_sleep.assert_any_call(1.0)
        mock_sleep.assert_any_call(2.0)

    def test_exhausts_retries_and_raises(self):
        from src import taiga_adapter
        with (
            patch.dict(taiga_adapter._token, {"value": "tok"}),
            patch.object(taiga_adapter, "TAIGA_API_URL", "https://taiga.example.com"),
            patch.object(taiga_adapter, "TAIGA_USERNAME", ""),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", ""),
            patch("src.taiga_adapter.requests.get", return_value=self._resp(503)),
            patch("src.taiga_adapter.time.sleep"),
        ):
            with pytest.raises(taiga_adapter.TaigaAPIError) as exc_info:
                taiga_adapter._get("projects/1")
        assert exc_info.value.status == 503

    def test_does_not_retry_404(self):
        from src import taiga_adapter
        with (
            patch.dict(taiga_adapter._token, {"value": "tok"}),
            patch.object(taiga_adapter, "TAIGA_API_URL", "https://taiga.example.com"),
            patch.object(taiga_adapter, "TAIGA_USERNAME", ""),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", ""),
            patch("src.taiga_adapter.requests.get", return_value=self._resp(404)) as mock_get,
            patch("src.taiga_adapter.time.sleep") as mock_sleep,
        ):
            with pytest.raises(taiga_adapter.TaigaAPIError) as exc_info:
                taiga_adapter._get("projects/1")
        mock_get.assert_called_once()
        mock_sleep.assert_not_called()
        assert exc_info.value.status == 404

    def test_does_not_retry_501(self):
        """501 Not Implemented is excluded from _RETRYABLE_STATUS."""
        from src import taiga_adapter
        with (
            patch.dict(taiga_adapter._token, {"value": "tok"}),
            patch.object(taiga_adapter, "TAIGA_API_URL", "https://taiga.example.com"),
            patch.object(taiga_adapter, "TAIGA_USERNAME", ""),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", ""),
            patch("src.taiga_adapter.requests.get", return_value=self._resp(501)) as mock_get,
            patch("src.taiga_adapter.time.sleep") as mock_sleep,
        ):
            with pytest.raises(taiga_adapter.TaigaAPIError):
                taiga_adapter._get("projects/1")
        mock_get.assert_called_once()
        mock_sleep.assert_not_called()

    def test_200_response_has_no_retries(self):
        result, mock_get, mock_sleep = self._get([self._resp(200, {"ok": True})])
        assert result == {"ok": True}
        mock_get.assert_called_once()
        mock_sleep.assert_not_called()


# ---------------------------------------------------------------------------
# normalize_epic
# ---------------------------------------------------------------------------

class TestNormalizeEpic:
    def test_all_fields_present(self):
        from src import taiga_adapter
        raw = {"id": 1, "ref": 42, "subject": "My Epic", "description": "A desc"}
        assert taiga_adapter.normalize_epic(raw) == {
            "id": 1, "ref": 42, "subject": "My Epic", "description": "A desc",
        }

    def test_missing_ref_falls_back_to_id(self):
        from src import taiga_adapter
        assert taiga_adapter.normalize_epic({"id": 5})["ref"] == 5

    def test_none_description_becomes_empty_string(self):
        from src import taiga_adapter
        assert taiga_adapter.normalize_epic({"id": 1, "description": None})["description"] == ""

    def test_missing_subject_becomes_empty_string(self):
        from src import taiga_adapter
        assert taiga_adapter.normalize_epic({"id": 2})["subject"] == ""

    def test_missing_description_becomes_empty_string(self):
        from src import taiga_adapter
        assert taiga_adapter.normalize_epic({"id": 3})["description"] == ""


# ---------------------------------------------------------------------------
# normalize_story
# ---------------------------------------------------------------------------

class TestNormalizeStory:
    def test_all_fields_with_epic_extra_info_dict(self):
        from src import taiga_adapter
        raw = {
            "id": 10, "ref": 7, "subject": "Login Story",
            "version": 3, "status": 1,
            "epic_extra_info": {"subject": "Auth Epic"},
        }
        result = taiga_adapter.normalize_story(raw)
        assert result["id"] == 10
        assert result["ref"] == 7
        assert result["subject"] == "Login Story"
        assert result["version"] == 3
        assert result["status"] == 1
        assert result["epic_subject"] == "Auth Epic"

    def test_epics_list_field(self):
        from src import taiga_adapter
        raw = {"id": 4, "epics": [{"subject": "Epic A"}, {"subject": "Epic B"}]}
        result = taiga_adapter.normalize_story(raw)
        assert result["epic_subject"] == "Epic A"

    def test_no_epic_info_gives_empty_epic_subject(self):
        from src import taiga_adapter
        raw = {"id": 5, "subject": "Orphan Story"}
        assert taiga_adapter.normalize_story(raw)["epic_subject"] == ""

    def test_missing_ref_falls_back_to_id(self):
        from src import taiga_adapter
        assert taiga_adapter.normalize_story({"id": 3})["ref"] == 3

    def test_missing_subject_becomes_empty_string(self):
        from src import taiga_adapter
        assert taiga_adapter.normalize_story({"id": 6})["subject"] == ""

    def test_empty_epics_list_gives_empty_epic_subject(self):
        from src import taiga_adapter
        raw = {"id": 7, "epics": []}
        assert taiga_adapter.normalize_story(raw)["epic_subject"] == ""


# ---------------------------------------------------------------------------
# normalize applied in get_epics / get_stories
# ---------------------------------------------------------------------------

class TestGetEpicsNormalized:
    def test_returns_normalized_dicts(self):
        from src import taiga_adapter
        raw = [{"id": 1, "ref": 5, "subject": "Auth", "description": "Desc"}]
        with patch.object(taiga_adapter, "_get", return_value=raw):
            result = taiga_adapter.get_epics()
        assert result == [{"id": 1, "ref": 5, "subject": "Auth", "description": "Desc"}]

    def test_missing_fields_filled_in(self):
        from src import taiga_adapter
        with patch.object(taiga_adapter, "_get", return_value=[{"id": 2}]):
            result = taiga_adapter.get_epics()
        assert result[0] == {"id": 2, "ref": 2, "subject": "", "description": ""}

    def test_none_description_coerced_to_empty(self):
        from src import taiga_adapter
        with patch.object(taiga_adapter, "_get", return_value=[{"id": 3, "description": None}]):
            result = taiga_adapter.get_epics()
        assert result[0]["description"] == ""


class TestGetStoriesNormalized:
    def test_returns_normalized_dicts(self):
        from src import taiga_adapter
        raw = [{"id": 10, "ref": 3, "subject": "Login", "version": 1, "status": 2,
                "epic_extra_info": {"subject": "Auth"}}]
        with patch.object(taiga_adapter, "_get", return_value=raw):
            result = taiga_adapter.get_stories()
        assert result[0]["subject"] == "Login"
        assert result[0]["epic_subject"] == "Auth"
        assert "epic_extra_info" not in result[0]

    def test_missing_fields_filled_in(self):
        from src import taiga_adapter
        with patch.object(taiga_adapter, "_get", return_value=[{"id": 5}]):
            result = taiga_adapter.get_stories()
        assert result[0] == {"id": 5, "ref": 5, "subject": "", "version": None,
                              "status": None, "epic_subject": ""}


# ---------------------------------------------------------------------------
# normalize applied in create_epic / create_story
# ---------------------------------------------------------------------------

class TestCreateEpicNormalized:
    def test_returns_normalized_dict(self):
        from src import taiga_adapter
        raw = {"id": 10, "ref": 3, "subject": "My Epic", "description": "Desc"}
        with patch.object(taiga_adapter, "_post", return_value=raw):
            result = taiga_adapter.create_epic("My Epic", "Desc")
        assert result == {"id": 10, "ref": 3, "subject": "My Epic", "description": "Desc"}

    def test_missing_ref_falls_back_to_id(self):
        from src import taiga_adapter
        with patch.object(taiga_adapter, "_post", return_value={"id": 11}):
            result = taiga_adapter.create_epic("X", "")
        assert result["ref"] == 11
        assert result["subject"] == ""


class TestCreateStoryNormalized:
    def test_returns_normalized_dict(self):
        from src import taiga_adapter
        raw = {"id": 20, "ref": 7, "subject": "Login Flow", "version": 1, "status": 3}
        with patch.object(taiga_adapter, "_post", return_value=raw):
            result = taiga_adapter.create_story("Login Flow", "")
        assert result["id"] == 20
        assert result["subject"] == "Login Flow"
        assert result["epic_subject"] == ""

    def test_epic_extra_info_in_response_is_normalized(self):
        from src import taiga_adapter
        raw = {"id": 21, "ref": 8, "subject": "S",
               "epic_extra_info": {"subject": "Big Epic"}}
        with patch.object(taiga_adapter, "_post", return_value=raw):
            result = taiga_adapter.create_story("S", "")
        assert result["epic_subject"] == "Big Epic"


# ---------------------------------------------------------------------------
# Token refresh behaviour
# ---------------------------------------------------------------------------

class TestTokenRefresh:
    def _resp(self, status: int, body: dict | None = None) -> MagicMock:
        r = MagicMock()
        r.status_code = status
        r.ok = status < 400
        r.content = b"{}" if body is not None else b""
        r.text = str(body or "error")
        r.json.return_value = body or {}
        return r

    def test_refreshes_token_on_401_with_credentials(self):
        from src import taiga_adapter
        with (
            patch.dict(taiga_adapter._token, {"value": "old_token"}),
            patch.object(taiga_adapter, "TAIGA_API_URL", "https://taiga.example.com"),
            patch.object(taiga_adapter, "TAIGA_USERNAME", "user"),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", "pass"),
            patch("src.taiga_adapter.requests.get",
                  side_effect=[self._resp(401), self._resp(200, {"id": 1})]),
            patch.object(taiga_adapter, "_refresh_token") as mock_refresh,
        ):
            result = taiga_adapter._get("projects/1")
        mock_refresh.assert_called_once()
        assert result == {"id": 1}

    def test_no_refresh_without_credentials_raises_401(self):
        from src import taiga_adapter
        with (
            patch.dict(taiga_adapter._token, {"value": "token"}),
            patch.object(taiga_adapter, "TAIGA_API_URL", "https://taiga.example.com"),
            patch.object(taiga_adapter, "TAIGA_USERNAME", ""),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", ""),
            patch("src.taiga_adapter.requests.get", return_value=self._resp(401)),
            patch("src.taiga_adapter.time.sleep"),
        ):
            with pytest.raises(taiga_adapter.TaigaAPIError) as exc_info:
                taiga_adapter._get("projects/1")
        assert exc_info.value.status == 401


# ---------------------------------------------------------------------------
# Pagination fallback
# ---------------------------------------------------------------------------

class TestPagination:
    def _paged(self, results, next_url=None) -> MagicMock:
        r = MagicMock()
        r.status_code = 200
        r.ok = True
        r.content = b"{}"
        r.json.return_value = {"results": results, "count": 99, "next": next_url}
        return r

    def test_follows_next_link_and_concatenates(self):
        from src import taiga_adapter
        page1 = self._paged([{"id": 1}], next_url="https://taiga.example.com/api/v1/projects?page=2")
        page2 = self._paged([{"id": 2}], next_url=None)

        with (
            patch.dict(taiga_adapter._token, {"value": "tok"}),
            patch.object(taiga_adapter, "TAIGA_API_URL", "https://taiga.example.com"),
            patch.object(taiga_adapter, "TAIGA_USERNAME", ""),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", ""),
            patch("src.taiga_adapter.requests.get", side_effect=[page1, page2]),
            patch("src.taiga_adapter.time.sleep"),
        ):
            result = taiga_adapter._get("projects")
        assert [r["id"] for r in result] == [1, 2]

    def test_single_page_no_next(self):
        from src import taiga_adapter
        page = self._paged([{"id": 3}], next_url=None)

        with (
            patch.dict(taiga_adapter._token, {"value": "tok"}),
            patch.object(taiga_adapter, "TAIGA_API_URL", "https://taiga.example.com"),
            patch.object(taiga_adapter, "TAIGA_USERNAME", ""),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", ""),
            patch("src.taiga_adapter.requests.get", return_value=page),
            patch("src.taiga_adapter.time.sleep"),
        ):
            result = taiga_adapter._get("projects")
        assert result == [{"id": 3}]


# ---------------------------------------------------------------------------
# delete_story / delete_epic path dispatch
# ---------------------------------------------------------------------------

class TestDeleteHelpers:
    def test_delete_story_calls_correct_path(self):
        from src import taiga_adapter
        with patch.object(taiga_adapter, "_delete") as mock_delete:
            taiga_adapter.delete_story(42)
        mock_delete.assert_called_once_with("userstories/42")

    def test_delete_epic_calls_correct_path(self):
        from src import taiga_adapter
        with patch.object(taiga_adapter, "_delete") as mock_delete:
            taiga_adapter.delete_epic(7)
        mock_delete.assert_called_once_with("epics/7")
