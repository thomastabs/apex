"""
app.py — bolt entry point and central router
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


_LIGHT_CSS = """
    /* ── Buttons ───────────────────────────────────────────────────────── */
    .stButton > button, [data-testid^="stBaseButton"] {
        background-color: #ffffff !important;
        color: #111111 !important;
        border: 1px solid #c8ccd4 !important;
        transition: background-color 0.15s, border-color 0.15s, color 0.15s !important;
    }
    [data-testid="stBaseButton-primary"] {
        background-color: #7c3aed !important;
        color: #ffffff !important;
        border: 1px solid #7c3aed !important;
    }
    .stButton > button:hover,
    [data-testid="stBaseButton-secondary"]:hover,
    [data-testid="stBaseButton-tertiary"]:hover {
        background-color: #ede9fe !important;
        border-color: #7c3aed !important;
    }
    [data-testid="stBaseButton-primary"]:hover {
        background-color: #6d28d9 !important;
        border-color: #6d28d9 !important;
    }
    /* ── Inputs and text areas ─────────────────────────────────────────── */
    [data-baseweb="input"],
    [data-baseweb="base-input"],
    [data-baseweb="textarea"] {
        background-color: #ffffff !important;
        border-color: #c8ccd4 !important;
    }
    [data-baseweb="input"] input,
    [data-baseweb="base-input"] input,
    [data-testid="stTextInput"] input,
    [data-testid="stNumberInput"] input,
    [data-baseweb="textarea"] textarea,
    [data-testid="stTextArea"] textarea,
    input[type="text"],
    input[type="number"],
    textarea {
        background-color: #ffffff !important;
        color: #111111 !important;
    }
    input::placeholder, textarea::placeholder {
        color: #9ca3af !important;
        opacity: 1 !important;
    }
    /* ── Selectboxes ───────────────────────────────────────────────────── */
    [data-baseweb="select"] > div:first-child,
    [data-baseweb="select"] [role="combobox"] {
        background-color: #ffffff !important;
        border-color: #c8ccd4 !important;
        color: #111111 !important;
    }
    /* ── Expanders ─────────────────────────────────────────────────────── */
    /* In Streamlit 1.x, data-testid="stExpander" is on a wrapper <div>;
       the actual <details> element is a child. */
    [data-testid="stExpander"] {
        border: 1.5px solid #111111 !important;
        border-radius: 6px !important;
        overflow: hidden !important;
        margin-bottom: 6px !important;
    }
    [data-testid="stExpander"] details {
        border: none !important;
    }
    [data-testid="stExpander"] summary {
        background-color: #d2d8e0 !important;
        color: #111111 !important;
        transition: background-color 0.15s !important;
    }
    [data-testid="stExpander"] summary:hover {
        background-color: #b8c0cc !important;
    }
    [data-testid="stExpander"] details > div {
        background-color: #f5f5f5 !important;
    }
    /* ── Sidebar dividers ──────────────────────────────────────────────── */
    [data-testid="stSidebar"] hr {
        border-color: #b8bec8 !important;
    }
    /* ── Page link hover ───────────────────────────────────────────────── */
    [data-testid="stPageLink"] a:hover {
        background-color: #b8c0cc !important;
        border-radius: 6px !important;
    }
    /* ── Toast notifications ───────────────────────────────────────────── */
    [data-testid="stToast"] {
        background-color: #ffffff !important;
        border: 1px solid #c8ccd4 !important;
    }
    [data-testid="stToast"] p,
    [data-testid="stToast"] span,
    [data-testid="stToast"] div {
        color: #111111 !important;
    }
    /* ── Alert boxes (success / error / warning / info) ───────────────── */
    [data-testid="stAlert"] [data-testid="stMarkdownContainer"] p,
    [data-testid="stAlert"] [data-testid="stMarkdownContainer"] span,
    [data-testid="stAlert"] [data-testid="stMarkdownContainer"] li,
    [data-testid="stAlert"] [data-testid="stMarkdownContainer"] a {
        color: #111111 !important;
    }
    /* ── Code blocks and inline code inside markdown ───────────────────── */
    [data-testid="stMarkdownContainer"] code,
    [data-testid="stMarkdownContainer"] pre,
    .stMarkdown code,
    .stMarkdown pre,
    code, pre {
        background-color: #e8eaed !important;
        color: #1a1a1a !important;
    }
    /* ── st.status() container text ────────────────────────────────────── */
    [data-testid="stStatusWidget"] p,
    [data-testid="stStatusWidget"] span,
    [data-testid="stStatusWidget"] label {
        color: #111111 !important;
    }
    /* ── Dialog / Modal popup ───────────────────────────────────────────── */
    /* Backdrop overlay */
    [data-testid="stDialog"] {
        background: rgba(0,0,0,0.5) !important;
    }
    /* Dialog box — white card with border and shadow so edges are clear */
    [data-testid="stDialog"] > div > div,
    [data-testid="stDialog"] [role="dialog"],
    div[data-baseweb="modal"] > div,
    div[data-baseweb="modal"] [role="dialog"] {
        background-color: #ffffff !important;
        border: 1.5px solid #c0c6d0 !important;
        border-radius: 10px !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10) !important;
    }
    /* All text inside dialogs */
    [data-testid="stDialog"] p,
    [data-testid="stDialog"] span,
    [data-testid="stDialog"] label,
    [data-testid="stDialog"] h1,
    [data-testid="stDialog"] h2,
    [data-testid="stDialog"] h3,
    [data-testid="stDialog"] [data-testid="stMarkdownContainer"],
    [data-testid="stDialog"] [data-testid="stMarkdownContainer"] p,
    [data-testid="stDialog"] [data-testid="stMarkdownContainer"] span,
    div[data-baseweb="modal"] p,
    div[data-baseweb="modal"] span,
    div[data-baseweb="modal"] label {
        color: #111111 !important;
    }
    /* Inputs and textareas inside dialogs */
    [data-testid="stDialog"] input,
    [data-testid="stDialog"] textarea {
        background-color: #ffffff !important;
        color: #111111 !important;
    }
    /* Selectbox inside dialogs */
    [data-testid="stDialog"] [data-baseweb="select"] > div:first-child {
        background-color: #ffffff !important;
        color: #111111 !important;
    }
    /* Close button */
    [data-testid="stDialog"] [data-testid="stBaseButton-headerNoPadding"],
    [data-testid="stDialog"] button[kind="header"] {
        color: #111111 !important;
        background-color: transparent !important;
    }
"""


def _inject_theme(is_dark: bool) -> None:
    """Inject CSS overrides on every rerun to switch light/dark.

    Streamlit 1.56 uses emotion CSS-in-JS — theme colours are baked into
    hashed class names at WebSocket connection time and cannot be changed
    via CSS custom properties mid-session. Targeting the actual DOM elements
    with !important is the only approach that works.

    Bolt logo: Streamlit strips !important from inline styles in st.markdown(),
    so we use a high-specificity attribute selector here to keep it purple.
    """
    t = _THEMES[is_dark]
    extra = "" if is_dark else _LIGHT_CSS
    st.markdown(f"""<style>
    .stApp, [data-testid="stAppViewContainer"] {{
        background-color: {t['bg']} !important;
        color: {t['text']} !important;
    }}
    [data-testid="stMain"], [data-testid="stMainBlockContainer"],
    .block-container, section.main {{
        background-color: {t['bg']} !important;
    }}
    [data-testid="stHeader"] {{
        background-color: {t['bg']} !important;
    }}
    [data-testid="stSidebar"], [data-testid="stSidebarContent"],
    [data-testid="stSidebar"] > div:first-child {{
        background-color: {t['sbg']} !important;
    }}
    body, p, span, label, div.stMarkdown,
    [data-testid="stMarkdownContainer"] {{
        color: {t['text']} !important;
    }}
    /* Bolt logo — high-specificity selector beats the broad span rule above.
       Streamlit strips !important from inline styles so this is the only fix. */
    [data-testid="stSidebar"] span[style*="1.55rem"] {{
        color: #7c3aed !important;
    }}
    /* Reduce vertical bulk of st.divider() — the wrapper divs carry default
       padding that dwarfs the <hr> itself. */
    div:has(> [data-testid="stMarkdownContainer"] > hr) {{
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
    }}
    [data-testid="stMarkdownContainer"]:has(hr) {{
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
    }}
    [data-testid="stMarkdownContainer"] hr {{
        margin: 0.25rem 0 !important;
    }}
    {extra}
    </style>""", unsafe_allow_html=True)


# ── Page config (must be first Streamlit call) ────────────────────────────────

st.set_page_config(
    page_title="bolt",
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
