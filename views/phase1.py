import streamlit as st
st.session_state["_active_phase"] = 1
from components.phase1 import render_phase1

render_phase1()
