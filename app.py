"""
app.py — apex entry point and central router
"""

import logging
import os
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from components.sidebar import render_sidebar

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)

# ── Application Insights telemetry ────────────────────────────────────────────
# Initialised once per process (guarded by module-level flag so Streamlit
# reruns don't re-configure the OpenTelemetry SDK on every user interaction).

_TELEMETRY_CONFIGURED = False


def _configure_telemetry() -> None:
    global _TELEMETRY_CONFIGURED
    if _TELEMETRY_CONFIGURED:
        return
    conn = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")
    if conn:
        try:
            from azure.monitor.opentelemetry import configure_azure_monitor
            configure_azure_monitor(connection_string=conn)
            logging.getLogger("apex").info("Application Insights telemetry active")
        except Exception as exc:  # noqa: BLE001
            logging.getLogger("apex").warning("App Insights init failed: %s", exc)
    _TELEMETRY_CONFIGURED = True


_configure_telemetry()

_PREF_FILE = Path("contextspec/.apex-theme")

_THEMES = {
    True:  {"bg": "#1a1a1a", "sbg": "#242424", "text": "#d4d4d4"},
    False: {"bg": "#f5f5f5", "sbg": "#dde2ea",  "text": "#111111"},
}


def _load_pref() -> bool:
    """Return True = dark (default), False = light."""
    try:
        return _PREF_FILE.read_text().strip() != "light"
    except FileNotFoundError:
        return True


_STATIC_DIR = Path(__file__).parent / "static"
_CSS_BASE  = (_STATIC_DIR / "theme_base.css").read_text()
_CSS_LIGHT = (_STATIC_DIR / "light.css").read_text()


def _inject_theme(is_dark: bool) -> None:
    """Inject CSS overrides on every rerun to switch light/dark.

    Streamlit 1.56 uses emotion CSS-in-JS — theme colours are baked into
    hashed class names at WebSocket connection time and cannot be changed
    via CSS custom properties mid-session. Targeting the actual DOM elements
    with !important is the only approach that works.
    """
    t = _THEMES[is_dark]
    dynamic = (
        f'.stApp, [data-testid="stAppViewContainer"] {{'
        f' background-color: {t["bg"]} !important; color: {t["text"]} !important; }}\n'
        f'[data-testid="stMain"], [data-testid="stMainBlockContainer"],'
        f' .block-container, section.main {{ background-color: {t["bg"]} !important; }}\n'
        f'[data-testid="stHeader"] {{ background-color: {t["bg"]} !important; }}\n'
        f'[data-testid="stSidebar"], [data-testid="stSidebarContent"],'
        f' [data-testid="stSidebar"] > div:first-child {{ background-color: {t["sbg"]} !important; }}\n'
        f'body, p, span, label, div.stMarkdown,'
        f' [data-testid="stMarkdownContainer"] {{ color: {t["text"]} !important; }}\n'
    )
    light = _CSS_LIGHT if not is_dark else ""
    st.markdown("<style>" + dynamic + _CSS_BASE + light + "</style>", unsafe_allow_html=True)


# ── Page config (must be first Streamlit call) ────────────────────────────────

st.set_page_config(
    page_title="Apex",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Theme ─────────────────────────────────────────────────────────────────────
# Initialise from persisted file once per browser session.
# The button in the sidebar writes to session_state and calls st.rerun();
# on that rerun app.py picks up the new value here and re-injects the CSS.

if "theme_is_dark" not in st.session_state:
    st.session_state["theme_is_dark"] = _load_pref()

_inject_theme(st.session_state["theme_is_dark"])

# ── Restore persisted project (once per browser session) ─────────────────────
# Auth tokens are intentionally NOT persisted — an expired token would cause
# cascading 401 errors on every sidebar render.  The user signs in fresh each
# session via the ⇄ button; the active project is still remembered.

if "_config_loaded" not in st.session_state:
    from src import context_manager as _ctx_mgr, taiga_adapter as _ta
    _cfg = _ctx_mgr.load_config()
    _saved_pid = _cfg.get("project_id", 0)
    if _saved_pid and _saved_pid != _ta.TAIGA_PROJECT_ID:
        _ta.set_active_project(_saved_pid)
    st.session_state["_config_loaded"]    = True
    st.session_state["active_project_id"] = _ta.TAIGA_PROJECT_ID
else:
    # ── Per-session project isolation ─────────────────────────────────────────
    # TAIGA_PROJECT_ID is a process-level global shared across all browser tabs.
    # Storing the selection in session_state keeps each tab independent: if Tab B
    # switches projects, Tab A's next render restores its own selection here.
    from src import taiga_adapter as _ta
    _session_pid = st.session_state.get("active_project_id", 0)
    if _session_pid and _session_pid != _ta.TAIGA_PROJECT_ID:
        _ta.set_active_project(_session_pid)

# ── Navigation ────────────────────────────────────────────────────────────────

_pages = [
    st.Page("views/phase1.py", title="Phase 1 · Requirements", default=True),
    st.Page("views/phase2.py", title="Phase 2 · Design"),
    st.Page("views/phase3.py", title="Phase 3 · Implementation"),
    st.Page("views/phase4.py", title="Phase 4 · Testing"),
    st.Page("views/phase5.py", title="Phase 5 · Deployment"),
    st.Page("views/phase6.py", title="Phase 6 · Maintenance"),
]

pg = st.navigation(_pages, position="hidden")
pg.run()
render_sidebar()
