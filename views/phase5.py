import streamlit as st

st.header("Phase 5 · Deployment")
st.caption("Infrastructure Delta — determine required IaC changes before each deployment")
st.divider()
st.info(
    "Coming in the next iteration.  \n"
    "The DevOps AI analyses `contextspec/technical-spec.md` and determines whether new infrastructure "
    "is required. If yes, outputs a Terraform HCL or CloudFormation YAML draft for review "
    "by the DevOps Alliance."
)
