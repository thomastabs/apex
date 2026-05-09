"""
app.py — apex entry point and central router
"""

import logging
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

_PREF_FILE = Path(".streamlit/.theme_pref")

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
    base = (_STATIC_DIR / "theme_base.css").read_text()
    light = (_STATIC_DIR / "light.css").read_text() if not is_dark else ""
    st.markdown("<style>" + dynamic + base + light + "</style>", unsafe_allow_html=True)


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

# ── Restore persisted project selection ───────────────────────────────────────
# Runs once per browser session. Reads the project ID saved to the file share
# so container restarts don't reset the active project back to 0.

if "_config_loaded" not in st.session_state:
    from src import context_manager as _ctx_mgr, taiga_adapter as _ta
    _saved = _ctx_mgr.load_config().get("project_id", 0)
    if _saved and _saved != _ta.TAIGA_PROJECT_ID:
        _ta.set_active_project(_saved)
    st.session_state["_config_loaded"] = True

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
