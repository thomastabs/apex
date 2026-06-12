# python:3.12-slim pinned by digest for reproducible builds (2026-06-11).
# To bump: docker buildx imagetools inspect python:3.12-slim
FROM python:3.12-slim@sha256:a39549e211a16149edf74e5fdc9ef03a6767e46cd987c5048b6659b6c9904c94

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

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
