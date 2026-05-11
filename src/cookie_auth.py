"""
cookie_auth.py — browser-side session persistence via cookies.
Uses extra-streamlit-components CookieManager (JavaScript-backed).
Call init() once at the top of app.py on every page run before any gate checks.
"""

from datetime import datetime, timedelta

import streamlit as st

_COOKIE   = "apex_session"
_TTL_DAYS = 7
_MGR_KEY  = "_apex_cookie_mgr"


def init() -> None:
    """Instantiate (and render) the CookieManager. Must be called on every page run.

    CookieManager renders a custom component on each run to read browser cookies —
    it cannot be wrapped in @st.cache_resource because that defers the render.
    We store the instance in session_state so other helpers can reach it.
    """
    import extra_streamlit_components as stx  # noqa: PLC0415
    st.session_state[_MGR_KEY] = stx.CookieManager(key="apex_cookies")


def _mgr():
    return st.session_state.get(_MGR_KEY)


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
