"""
cookie_auth.py — browser-side session persistence via cookies.
Uses extra-streamlit-components CookieManager (JavaScript-backed).
Call init() once at the top of app.py on every page run before any gate checks.
"""

from datetime import datetime, timedelta

import streamlit as st

_COOKIE  = "apex_session"
_TTL_DAYS = 7


@st.cache_resource
def _mgr():
    import extra_streamlit_components as stx  # noqa: PLC0415
    return stx.CookieManager(key="apex_cookies")


def init() -> None:
    """Render the invisible cookie component. Must be called on every page run."""
    _mgr()


def get_token() -> str:
    """Return the stored Taiga token from the browser cookie, or ''."""
    try:
        return (_mgr().get_all() or {}).get(_COOKIE, "") or ""
    except Exception:
        return ""


def save_token(token: str) -> None:
    """Write the Taiga token to the browser session cookie (7-day TTL)."""
    try:
        _mgr().set(
            _COOKIE, token,
            expires_at=datetime.now() + timedelta(days=_TTL_DAYS),
            key="apex_cookie_set",
        )
    except Exception:
        pass


def clear() -> None:
    """Delete the browser session cookie."""
    try:
        _mgr().delete(_COOKIE, key="apex_cookie_del")
    except Exception:
        pass
