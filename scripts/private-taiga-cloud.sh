#!/usr/bin/env bash
set -Eeuo pipefail

TAIGA_DIR="${TAIGA_DIR:-$HOME/taiga-docker}"
TAIGA_ADMIN_USERNAME="${TAIGA_ADMIN_USERNAME:-admin}"
TAIGA_ADMIN_EMAIL="${TAIGA_ADMIN_EMAIL:-admin@localhost.com}"
TAIGA_ADMIN_PASSWORD="${TAIGA_ADMIN_PASSWORD:-yourpassword}"
APEX_BACKEND_PORT="${APEX_BACKEND_PORT:-8000}"
TAIGA_LOCAL_URL="${TAIGA_LOCAL_URL:-http://localhost:9000}"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-cloudflared}"
INSTALL_CLOUDFLARED="${INSTALL_CLOUDFLARED:-0}"
WITH_FRONTEND="${WITH_FRONTEND:-0}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TUNNEL_LOG="$(mktemp -t apex-cloudflared.XXXXXX.log)"
PIDS=()

usage() {
  cat <<'EOF'
Usage: scripts/private-taiga-cloud.sh [options]

Starts a local Taiga Docker instance, exposes it through a temporary
trycloudflare.com HTTPS tunnel, and runs the Apex backend with TAIGA_API_URL
anchored to that tunnel.

Options:
  --install-cloudflared   Download cloudflared into ~/.local/bin if missing
  --with-frontend         Also run the Next.js frontend on port 3000
  --taiga-dir DIR         taiga-docker checkout path (default: ~/taiga-docker)
  --username USER         Taiga admin username (default: admin)
  --email EMAIL           Taiga admin email (default: admin@localhost.com)
  --password PASSWORD     Taiga admin password (default: yourpassword)
  --backend-port PORT     Apex backend port (default: 8000)
  -h, --help              Show this help

Equivalent environment variables:
  TAIGA_DIR, TAIGA_ADMIN_USERNAME, TAIGA_ADMIN_EMAIL, TAIGA_ADMIN_PASSWORD,
  APEX_BACKEND_PORT, TAIGA_LOCAL_URL, CLOUDFLARED_BIN, INSTALL_CLOUDFLARED,
  WITH_FRONTEND
EOF
}

log() {
  printf '[private-taiga] %s\n' "$*" >&2
}

die() {
  printf '[private-taiga] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local status=$?
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  rm -f "$TUNNEL_LOG"
  exit "$status"
}
trap cleanup EXIT INT TERM

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-cloudflared)
      INSTALL_CLOUDFLARED=1
      shift
      ;;
    --with-frontend)
      WITH_FRONTEND=1
      shift
      ;;
    --taiga-dir)
      TAIGA_DIR="${2:?Missing value for --taiga-dir}"
      shift 2
      ;;
    --username)
      TAIGA_ADMIN_USERNAME="${2:?Missing value for --username}"
      shift 2
      ;;
    --email)
      TAIGA_ADMIN_EMAIL="${2:?Missing value for --email}"
      shift 2
      ;;
    --password)
      TAIGA_ADMIN_PASSWORD="${2:?Missing value for --password}"
      shift 2
      ;;
    --backend-port)
      APEX_BACKEND_PORT="${2:?Missing value for --backend-port}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

retry() {
  local attempts="$1"
  local delay="$2"
  shift 2

  local attempt=1
  until "$@"; do
    if (( attempt >= attempts )); then
      return 1
    fi
    log "Command failed; retrying in ${delay}s ($attempt/$attempts)"
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

install_cloudflared() {
  if command -v "$CLOUDFLARED_BIN" >/dev/null 2>&1; then
    return
  fi

  [[ "$INSTALL_CLOUDFLARED" == "1" ]] || die "cloudflared is not installed. Re-run with --install-cloudflared or set CLOUDFLARED_BIN."
  require_command curl

  local arch target install_dir installed_bin
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) target="linux-amd64" ;;
    aarch64|arm64) target="linux-arm64" ;;
    *) die "Unsupported architecture for automatic cloudflared install: $arch" ;;
  esac

  install_dir="$HOME/.local/bin"
  installed_bin="$install_dir/cloudflared"
  mkdir -p "$install_dir"

  log "Installing cloudflared to $installed_bin"
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-$target" -o "$installed_bin"
  chmod +x "$installed_bin"
  CLOUDFLARED_BIN="$installed_bin"
}

prepare_taiga_checkout() {
  require_command git
  require_command docker

  if [[ ! -d "$TAIGA_DIR/.git" ]]; then
    log "Cloning taiga-docker into $TAIGA_DIR"
    git clone https://github.com/taigaio/taiga-docker "$TAIGA_DIR"
  else
    log "Using existing taiga-docker checkout at $TAIGA_DIR"
  fi

  cd "$TAIGA_DIR"

  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      cp .env.example .env
    else
      touch .env
    fi
  fi

  if grep -q '^ENABLE_TELEMETRY=' .env; then
    sed -i.bak 's/^ENABLE_TELEMETRY=.*/ENABLE_TELEMETRY=False/' .env
  else
    printf '\nENABLE_TELEMETRY=False\n' >> .env
  fi
}

start_taiga() {
  cd "$TAIGA_DIR"
  log "Starting Taiga Docker services"
  docker compose up -d

  log "Running Taiga migrations"
  retry 10 5 bash taiga-manage.sh migrate

  log "Ensuring Taiga admin user exists: $TAIGA_ADMIN_USERNAME"
  retry 5 5 docker compose -f docker-compose.yml -f docker-compose-inits.yml run --rm \
    -e APEX_TAIGA_ADMIN_USERNAME="$TAIGA_ADMIN_USERNAME" \
    -e APEX_TAIGA_ADMIN_EMAIL="$TAIGA_ADMIN_EMAIL" \
    -e APEX_TAIGA_ADMIN_PASSWORD="$TAIGA_ADMIN_PASSWORD" \
    taiga-manage shell -c '
import os
from django.apps import apps

User = apps.get_model("users", "User")
username = os.environ["APEX_TAIGA_ADMIN_USERNAME"]
email = os.environ["APEX_TAIGA_ADMIN_EMAIL"]
password = os.environ["APEX_TAIGA_ADMIN_PASSWORD"]

user, created = User.objects.get_or_create(username=username, defaults={"email": email, "is_staff": True, "is_superuser": True})
user.email = email
user.is_staff = True
user.is_superuser = True
user.set_password(password)
user.save()
status = "created" if created else "updated"
print(f"{username} {status}")
'
}

start_tunnel() {
  log "Starting Cloudflare tunnel for $TAIGA_LOCAL_URL"
  "$CLOUDFLARED_BIN" tunnel --url "$TAIGA_LOCAL_URL" >"$TUNNEL_LOG" 2>&1 &
  PIDS+=("$!")

  local tunnel_url=""
  for _ in $(seq 1 60); do
    tunnel_url="$(grep -Eo 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | tail -n 1 || true)"
    if [[ -n "$tunnel_url" ]]; then
      printf '%s' "$tunnel_url"
      return
    fi
    sleep 1
  done

  sed -n '1,120p' "$TUNNEL_LOG" >&2
  die "Timed out waiting for cloudflared to print a trycloudflare.com URL"
}

start_backend() {
  local tunnel_url="$1"
  cd "$ROOT_DIR"
  require_command python3

  log "Starting Apex backend on http://localhost:$APEX_BACKEND_PORT"
  TAIGA_API_URL="$tunnel_url" python3 -m uvicorn backend.app.main:app --reload --port "$APEX_BACKEND_PORT" &
  PIDS+=("$!")
}

start_frontend() {
  [[ "$WITH_FRONTEND" == "1" ]] || return
  cd "$ROOT_DIR/frontend"
  require_command npm

  if [[ ! -d node_modules ]]; then
    log "Installing frontend dependencies"
    npm ci
  fi

  log "Starting Apex frontend on http://localhost:3000"
  NEXT_PUBLIC_API_BASE_URL="http://localhost:$APEX_BACKEND_PORT" npm run dev &
  PIDS+=("$!")
}

main() {
  install_cloudflared
  require_command "$CLOUDFLARED_BIN"
  prepare_taiga_checkout
  start_taiga

  local tunnel_url
  tunnel_url="$(start_tunnel)"

  start_backend "$tunnel_url"
  start_frontend

  cat <<EOF

Private Taiga test stack is running.

Taiga instance URL: $tunnel_url
Taiga username:     $TAIGA_ADMIN_USERNAME
Taiga password:     $TAIGA_ADMIN_PASSWORD
Apex backend:       http://localhost:$APEX_BACKEND_PORT
EOF

  if [[ "$WITH_FRONTEND" == "1" ]]; then
    printf 'Apex frontend:      http://localhost:3000\n'
  fi

  cat <<EOF

Use the Taiga instance URL in the Apex sidebar. Press Ctrl+C here to stop the
tunnel and Apex processes. Taiga Docker services keep running; stop them with:
  cd "$TAIGA_DIR" && docker compose down

EOF

  wait -n "${PIDS[@]}"
}

main
