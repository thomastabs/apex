"""
app.py — bolt entry point and central router
"""

import streamlit as st
from dotenv import load_dotenv

from components.sidebar import render_sidebar

load_dotenv()

st.set_page_config(
    page_title="bolt",
    layout="wide",
    initial_sidebar_state="expanded",
)

_pages = [
    st.Page("views/phase1.py", title="Phase 1 · Requirements", default=True),
    st.Page("views/phase2.py", title="Phase 2 · Design"),
    st.Page("views/phase3.py", title="Phase 3 · Implementation"),
    st.Page("views/phase4.py", title="Phase 4 · Testing"),
    st.Page("views/phase5.py", title="Phase 5 · Deployment"),
    st.Page("views/phase6.py", title="Phase 6 · Maintenance"),
]

pg = st.navigation(_pages, position="hidden")
render_sidebar()
pg.run()
