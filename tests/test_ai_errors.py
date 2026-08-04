"""AI-error -> HTTP mapping and the global error handlers.

Covers the failure modes that used to fall through `_reclassify_llm_exc`
unmapped and surface as a bare 500 "Internal server error": an invalid model
id, a rejected API key, and a context-window overflow.
"""

import pytest
from fastapi import HTTPException

from backend.app.api.ai_errors import handle_ai_error
from src.ai_engine import (
    AIAuthError,
    AIContentFilterError,
    AIContextLengthError,
    AIError,
    AIModelError,
    AIRateLimitError,
    AITimeoutError,
    AIValidationError,
    _reclassify_llm_exc,
)


def _raise(exc: Exception) -> HTTPException:
    with pytest.raises(HTTPException) as info:
        handle_ai_error(exc)
    return info.value


class TestHandleAiError:
    @pytest.mark.parametrize(
        "exc,expected_status,expected_code",
        [
            (AIRateLimitError("slow down"), 429, "ai_rate_limit"),
            (AITimeoutError("too slow"), 504, "ai_timeout"),
            (AIAuthError("bad key"), 401, "ai_key_rejected"),
            (AIModelError("no such model"), 400, "ai_model_rejected"),
            (AIContextLengthError("too big"), 413, "ai_context_length"),
            (AIContentFilterError("refused"), 502, "ai_content_filter"),
            (AIValidationError("pydantic dump"), 502, "ai_malformed_output"),
            (AIError("generic"), 502, "ai_error"),
        ],
    )
    def test_maps_each_kind(self, exc, expected_status, expected_code):
        err = _raise(exc)
        assert err.status_code == expected_status
        assert err.detail["code"] == expected_code
        assert err.detail["message"]

    def test_malformed_output_message_is_actionable_not_a_pydantic_dump(self):
        err = _raise(AIValidationError("1 validation error for Foo\\n  field required"))
        assert "validation error for Foo" not in err.detail["message"]
        assert "different model" in err.detail["message"]

    def test_missing_key_is_a_config_error_not_a_gateway_error(self):
        err = _raise(EnvironmentError("ANTHROPIC_API_KEY is not set. Add your own key in Settings."))
        assert err.status_code == 401
        assert err.detail["code"] == "ai_key_missing"
        assert "Settings" in err.detail["message"]

    def test_non_ai_exception_passes_through_untouched(self):
        sentinel = ValueError("not an AI problem")
        with pytest.raises(ValueError) as info:
            handle_ai_error(sentinel)
        assert info.value is sentinel


class TestReclassify:
    def _named(self, name: str, message: str = "boom") -> Exception:
        return type(name, (Exception,), {})(message)

    def test_auth_error_class_becomes_ai_auth_error(self):
        with pytest.raises(AIAuthError):
            _reclassify_llm_exc(self._named("AuthenticationError"))

    def test_invalid_api_key_message_becomes_ai_auth_error(self):
        with pytest.raises(AIAuthError):
            _reclassify_llm_exc(Exception("invalid x-api-key"))

    def test_context_overflow_becomes_ai_context_length_error(self):
        with pytest.raises(AIContextLengthError) as info:
            _reclassify_llm_exc(Exception("prompt is too long: maximum context length exceeded"))
        assert "grounding" in str(info.value)

    def test_unknown_model_becomes_ai_model_error(self):
        with pytest.raises(AIModelError) as info:
            _reclassify_llm_exc(Exception("model_not_found: the model `claude-nope` does not exist"))
        assert "Settings" in str(info.value)

    def test_safety_block_becomes_content_filter_error(self):
        with pytest.raises(AIContentFilterError):
            _reclassify_llm_exc(Exception("blocked_reason: SAFETY"))

    def test_billing_exhaustion_is_treated_as_a_rate_limit(self):
        with pytest.raises(AIRateLimitError):
            _reclassify_llm_exc(Exception("Your credit balance is too low"))

    def test_still_reraises_a_genuinely_unrecognised_error(self):
        sentinel = Exception("something entirely new")
        with pytest.raises(Exception) as info:
            _reclassify_llm_exc(sentinel)
        assert info.value is sentinel

    def test_swallows_unrecognised_when_asked_to(self):
        assert _reclassify_llm_exc(Exception("something new"), reraise_unrecognized=False) is None
