FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip nodejs npm \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p contextspec

# Build the Reflex frontend (compiles React → static files)
RUN reflex export --frontend-only --no-zip 2>/dev/null || true

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=5 \
    CMD curl -sf http://localhost:8000/ping || exit 1

# In production mode Reflex serves the compiled React bundle from the backend
# process, so frontend and backend must be on the same port.
CMD ["reflex", "run", "--env", "prod", "--backend-host", "0.0.0.0", \
     "--frontend-port", "8000", "--backend-port", "8000"]
