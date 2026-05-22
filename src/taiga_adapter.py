"""taiga_adapter.py — Taiga web URL derivation.

All Taiga REST API calls now originate from the browser via taiga-direct.ts.
The only backend usage is _web_base_url() for the GET /config endpoint.
"""

import os
import re

from dotenv import load_dotenv

load_dotenv()

TAIGA_API_URL = os.getenv("TAIGA_API_URL", "https://api.taiga.io").rstrip("/")


def _web_base_url() -> str:
    """Derive the Taiga web base URL from TAIGA_API_URL.

    Handles two common patterns:
      https://api.taiga.io        → https://tree.taiga.io  (Taiga Cloud)
      https://taiga.example.com   → https://taiga.example.com (self-hosted)
    """
    url = TAIGA_API_URL.rstrip("/")
    # Taiga Cloud: api.taiga.io → tree.taiga.io
    url = re.sub(r"(https?://)api\.(taiga\.io)", r"\1tree.\2", url)
    # Self-hosted instances that use an api. subdomain
    url = re.sub(r"(https?://)api\.", r"\1", url)
    # Self-hosted instances that append /api or /api/v1 to the base URL
    url = re.sub(r"/api(?:/v\d+)?$", "", url)
    return url
