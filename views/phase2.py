import streamlit as st

st.header("Phase 2 · Design")
st.caption("System Design — generate OpenAPI specs and database schemas anchored to approved Gherkin")
st.divider()
st.info(
    "Coming in the next iteration.  \n"
    "Reads locked Gherkin from `contextspec/functional-spec.md`, generates a formal "
    "OpenAPI 3.0 contract and database schema via AI, and appends the Technical Spec "
    "to `contextspec/technical-spec.md` after human approval."
)
