"""jira_adapter.py — Jira web URL derivation.

All Jira REST API calls originate from the browser via jira-adapter.ts.
The only backend usage is get_web_base_url() for the GET /config endpoint.
"""


def get_web_base_url(jira_base_url: str) -> str:
    """Return the Jira instance base URL, stripped of trailing slashes."""
    return jira_base_url.rstrip("/")
