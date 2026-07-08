# python:3.12-slim pinned by digest for reproducible builds (2026-06-11).
# To bump: docker buildx imagetools inspect python:3.12-slim
FROM python:3.12-slim@sha256:a39549e211a16149edf74e5fdc9ef03a6767e46cd987c5048b6659b6c9904c94

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# git: server-side repo clone for github_fetch.py (GitHub context packing).
# Node/npm + repomix: pinned CLI that packs the cloned repo into github-context.md.
# curl/gnupg only needed to add the NodeSource repo; purged after install.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y --no-install-recommends nodejs \
    && npm install -g repomix@1.16.0 \
    && apt-get purge -y curl gnupg && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* /etc/apt/sources.list.d/nodesource.list

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY src ./src

# Non-root runtime user; uid 1000 matches the typical host dev uid so the
# docker-compose bind mount of ./contextspec stays writable on both sides.
RUN useradd --create-home --uid 1000 apex \
    && mkdir -p contextspec \
    && chown apex:apex contextspec

USER apex

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
