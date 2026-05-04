import streamlit as st

st.header("Phase 6 · Maintenance")
st.caption("Fix-Bolt & Vaccine Records — context-isolated bug diagnosis with permanent fix history")
st.divider()
st.info(
    "Coming in the next iteration.  \n"
    "Fetches a Taiga issue, accepts only the bug description + stack trace + isolated code snippet "
    "(Context Isolation Rule — the full context is never passed to the fix AI). "
    "Proposes a minimal patch and on approval appends a Vaccine Record to `contextspec/memory-bank.md`."
)
