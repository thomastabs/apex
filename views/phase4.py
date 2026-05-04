import streamlit as st

st.header("Phase 4 · Testing")
st.caption("BDD Test Generation — generate test suites strictly from locked Gherkin")
st.divider()
st.info(
    "Coming in the next iteration.  \n"
    "Generates Cypress or Pytest-BDD test scripts exclusively from approved Gherkin scenarios "
    "in `contextspec/functional-spec.md`, saves them to `contextspec/bdd_story_<id>.feature`, "
    "and moves the story to Staging in Taiga."
)
