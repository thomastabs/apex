#!/usr/bin/env bash
set -Eeuo pipefail

PLANE_DIR="${PLANE_DIR:-$HOME/plane-selfhost}"
PLANE_ADMIN_EMAIL="${PLANE_ADMIN_EMAIL:-admin@localhost.com}"
PLANE_ADMIN_PASSWORD="${PLANE_ADMIN_PASSWORD:-yourpassword}"
PLANE_WORKSPACE_SLUG="${PLANE_WORKSPACE_SLUG:-apex-selfhost-test}"
PLANE_WORKSPACE_NAME="${PLANE_WORKSPACE_NAME:-Apex Selfhost Test}"
PLANE_AIO_IMAGE="${PLANE_AIO_IMAGE:-makeplane/plane-aio-community:stable}"
PLANE_LOCAL_PORT="${PLANE_LOCAL_PORT:-8090}"
APEX_BACKEND_PORT="${APEX_BACKEND_PORT:-8000}"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-cloudflared}"
INSTALL_CLOUDFLARED="${INSTALL_CLOUDFLARED:-0}"
WITH_FRONTEND="${WITH_FRONTEND:-0}"
# cloudflared defaults to QUIC/UDP, which some sandboxed/restricted networks
# block outright (confirmed in a prior dev-machine run — the tunnel process
# starts but never prints a trycloudflare.com URL). --tunnel-protocol http2
# forces TCP and fixes it there; leave unset for normal networks.
TUNNEL_PROTOCOL="${TUNNEL_PROTOCOL:-}"

PLANE_LOCAL_URL="http://localhost:${PLANE_LOCAL_PORT}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TUNNEL_LOG="$(mktemp -t apex-cloudflared-plane.XXXXXX.log)"
PIDS=()

usage() {
  cat <<'EOF'
Usage: scripts/private-plane-cloud.sh [options]

Starts a local, self-hosted Plane instance (the official All-In-One Community
Docker image + Postgres/Redis/RabbitMQ/MinIO), exposes it through a temporary
trycloudflare.com HTTPS tunnel, provisions an admin user + workspace + a ready
-to-use Personal Access Token directly via Plane's own Django ORM (no browser
signup needed), and runs the Apex backend/frontend pointed at it.

Options:
  --install-cloudflared   Download cloudflared into ~/.local/bin if missing
  --with-frontend         Also run the Next.js frontend on port 3000
  --plane-dir DIR         Compose-file working directory (default: ~/plane-selfhost)
  --email EMAIL           Plane admin email (default: admin@localhost.com)
  --password PASSWORD     Plane admin password (default: yourpassword)
  --workspace-slug SLUG   Workspace slug to create (default: apex-selfhost-test)
  --backend-port PORT     Apex backend port (default: 8000)
  --plane-port PORT       Local port Plane's proxy listens on (default: 8090)
  --tunnel-protocol PROTO cloudflared --protocol value (e.g. http2). Use this
                          if the tunnel starts but never prints a
                          trycloudflare.com URL (QUIC/UDP blocked on your
                          network) — http2 forces TCP.
  -h, --help              Show this help

Equivalent environment variables:
  PLANE_DIR, PLANE_ADMIN_EMAIL, PLANE_ADMIN_PASSWORD, PLANE_WORKSPACE_SLUG,
  PLANE_WORKSPACE_NAME, PLANE_AIO_IMAGE, PLANE_LOCAL_PORT, APEX_BACKEND_PORT,
  CLOUDFLARED_BIN, INSTALL_CLOUDFLARED, WITH_FRONTEND, TUNNEL_PROTOCOL

Note: unlike scripts/private-taiga-cloud.sh, this does NOT auto-install
Docker itself (Docker Desktop or the daemon must already be running) — Plane's
AIO image plus four support services is a heavier stack than Taiga's compose
file, not something worth silently bootstrapping.
EOF
}

log() {
  printf '[private-plane] %s\n' "$*" >&2
}

die() {
  printf '[private-plane] ERROR: %s\n' "$*" >&2
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
    --plane-dir)
      PLANE_DIR="${2:?Missing value for --plane-dir}"
      shift 2
      ;;
    --email)
      PLANE_ADMIN_EMAIL="${2:?Missing value for --email}"
      shift 2
      ;;
    --password)
      PLANE_ADMIN_PASSWORD="${2:?Missing value for --password}"
      shift 2
      ;;
    --workspace-slug)
      PLANE_WORKSPACE_SLUG="${2:?Missing value for --workspace-slug}"
      shift 2
      ;;
    --backend-port)
      APEX_BACKEND_PORT="${2:?Missing value for --backend-port}"
      shift 2
      ;;
    --plane-port)
      PLANE_LOCAL_PORT="${2:?Missing value for --plane-port}"
      PLANE_LOCAL_URL="http://localhost:${PLANE_LOCAL_PORT}"
      shift 2
      ;;
    --tunnel-protocol)
      TUNNEL_PROTOCOL="${2:?Missing value for --tunnel-protocol}"
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

# Writes the compose file + .env fresh every run — Plane's self-host layout
# has no single "clone this repo" directory the way taiga-docker does (the
# official self-host docs changed shape more than once this year; see
# plane_integration_plan memory phase 5j), so generating a known-working
# compose file here is more reliable than pointing at an upstream repo path
# that may move again. Re-running is safe: `docker compose up -d` no-ops on
# unchanged services, and Postgres/MinIO/RabbitMQ data persists in named
# volumes across restarts.
write_plane_compose() {
  mkdir -p "$PLANE_DIR"
  cat > "$PLANE_DIR/docker-compose.yml" <<EOF
services:
  plane-db:
    image: postgres:15.7-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: plane
      POSTGRES_PASSWORD: plane
      POSTGRES_DB: plane
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U plane"]
      interval: 5s
      timeout: 5s
      retries: 10

  plane-redis:
    image: valkey/valkey:7.2.11-alpine
    restart: unless-stopped
    volumes:
      - redisdata:/data

  plane-mq:
    image: rabbitmq:3.13.6-management-alpine
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: plane
      RABBITMQ_DEFAULT_PASS: plane
      RABBITMQ_DEFAULT_VHOST: plane
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

  plane-minio:
    image: minio/minio
    restart: unless-stopped
    command: server /export --console-address ":9090"
    environment:
      MINIO_ROOT_USER: planeaccess
      MINIO_ROOT_PASSWORD: planesecretkey
    volumes:
      - uploads:/export

  plane-minio-init:
    image: minio/mc
    depends_on:
      - plane-minio
    entrypoint: >
      /bin/sh -c "
      until (mc alias set local http://plane-minio:9000 planeaccess planesecretkey) do sleep 1; done;
      mc mb --ignore-existing local/uploads;
      mc anonymous set download local/uploads;
      exit 0;
      "

  plane-aio:
    image: ${PLANE_AIO_IMAGE}
    container_name: plane-aio
    restart: unless-stopped
    depends_on:
      plane-db:
        condition: service_healthy
      plane-redis:
        condition: service_started
      plane-mq:
        condition: service_started
      plane-minio-init:
        condition: service_completed_successfully
    ports:
      - "${PLANE_LOCAL_PORT}:80"
    environment:
      DOMAIN_NAME: \${DOMAIN_NAME}
      DATABASE_URL: postgresql://plane:plane@plane-db:5432/plane
      REDIS_URL: redis://plane-redis:6379
      AMQP_URL: amqp://plane:plane@plane-mq:5672/plane
      AWS_REGION: us-east-1
      AWS_ACCESS_KEY_ID: planeaccess
      AWS_SECRET_ACCESS_KEY: planesecretkey
      AWS_S3_BUCKET_NAME: uploads
      AWS_S3_ENDPOINT_URL: http://plane-minio:9000
      FILE_SIZE_LIMIT: 10485760

volumes:
  pgdata:
  redisdata:
  rabbitmq_data:
  uploads:
EOF

  if [[ ! -f "$PLANE_DIR/.env" ]]; then
    echo "DOMAIN_NAME=localhost" > "$PLANE_DIR/.env"
  fi
}

start_plane() {
  require_command docker
  cd "$PLANE_DIR"
  log "Starting Plane self-hosted stack (this pulls makeplane/plane-aio-community + 4 support services on first run)"
  docker compose up -d

  log "Waiting for Plane's API to come up (first boot runs Django's full migration set — this can take a few minutes, not a hang)"
  # 401 is the SUCCESS signal here (Plane's API correctly rejecting an
  # unauthenticated request means it's actually up) — plain curl -f would
  # treat 401 as failure and this would never converge, so the readiness
  # check greps the raw status code instead of relying on curl's own exit code.
  retry 90 5 bash -c "curl -sS -o /dev/null -w '%{http_code}' '$PLANE_LOCAL_URL/api/v1/users/me/' --max-time 5 2>/dev/null | grep -qE '^(401|403|200)'" \
    || die "Timed out waiting for Plane's API to respond. Check: docker logs plane-aio"
}

start_tunnel() {
  log "Starting Cloudflare tunnel for $PLANE_LOCAL_URL"
  local proto_args=()
  if [[ -n "$TUNNEL_PROTOCOL" ]]; then
    proto_args=(--protocol "$TUNNEL_PROTOCOL")
  fi
  "$CLOUDFLARED_BIN" tunnel --url "$PLANE_LOCAL_URL" "${proto_args[@]}" >"$TUNNEL_LOG" 2>&1 &
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

# Plane bakes DOMAIN_NAME into its CSRF/CORS trusted-origins at container
# start, but the tunnel hostname is only known once Plane is already
# listening — recreate the container once with the real hostname so Plane
# trusts it. Django migrations are already applied at this point (idempotent
# — re-running the AIO image's internal migrator supervisor program on
# recreate is fast, seconds not minutes).
retarget_domain() {
  local tunnel_host="$1"
  cd "$PLANE_DIR"
  echo "DOMAIN_NAME=${tunnel_host#https://}" > .env
  log "Recreating plane-aio with DOMAIN_NAME=${tunnel_host#https://}"
  docker compose up -d --force-recreate plane-aio

  retry 60 3 bash -c "curl -sS -o /dev/null -w '%{http_code}' 'https://${tunnel_host#https://}/api/v1/users/me/' --max-time 8 2>/dev/null | grep -qE '^(401|403|200)'" \
    || die "Plane did not come back up through the tunnel after recreation. Check: docker logs plane-aio"
}

# Provisions the admin user, promotes them to instance admin, creates the
# workspace + membership, and mints a ready-to-use Personal Access Token —
# all directly via Plane's own Django ORM inside the running container.
# Confirmed working end-to-end this way (plane_integration_plan memory phase
# 5j): no createsuperuser-style management command exists for Plane the way
# Taiga's does, and no APIToken-minting command exists either, but the ORM
# path is fully supported and mirrors exactly what Taiga's own script already
# does (raw model manipulation via a Django shell -c one-liner, same class of
# operation, same "known local dev credential" posture — not a new pattern).
provision_admin() {
  log "Provisioning admin user, workspace, and API token"
  local out
  out="$(retry 10 5 docker exec plane-aio python /app/backend/manage.py shell -c "
from plane.db.models import User, Workspace, WorkspaceMember, APIToken
from plane.license.models import Instance, InstanceAdmin

email = '${PLANE_ADMIN_EMAIL}'
user, _ = User.objects.get_or_create(email=email, defaults={'username': email, 'is_staff': True, 'is_superuser': True})
user.set_password('${PLANE_ADMIN_PASSWORD}')
user.is_active = True
user.is_email_verified = True
user.is_staff = True
user.is_superuser = True
user.save()

instance = Instance.objects.first()
if instance is not None:
    InstanceAdmin.objects.get_or_create(user=user, instance=instance, defaults={'role': 20})
    instance.is_setup_done = True
    instance.instance_name = '${PLANE_WORKSPACE_NAME}'
    instance.save()

ws, _ = Workspace.objects.get_or_create(slug='${PLANE_WORKSPACE_SLUG}', defaults={'name': '${PLANE_WORKSPACE_NAME}', 'owner': user})
WorkspaceMember.objects.get_or_create(workspace=ws, member=user, defaults={'role': 20})

tok, _ = APIToken.objects.get_or_create(user=user, workspace=ws, label='apex-selfhost-script', defaults={'user_type': 0})
print('APEX_PLANE_TOKEN=' + tok.token)
")"
  echo "$out" | grep '^APEX_PLANE_TOKEN=' | tail -n 1 | cut -d= -f2-
}

reload_plane_after_provision() {
  cd "$PLANE_DIR"
  log "Restarting plane-aio once so Plane's frontend/API reload the setup-complete state"
  docker compose restart plane-aio

  retry 60 3 bash -c "curl -sS -o /dev/null -w '%{http_code}' 'https://${1#https://}/api/instances/' --max-time 8 2>/dev/null | grep -q '^200$'" \
    || die "Plane did not come back up after provisioning restart. Check: docker logs plane-aio"
}

start_backend() {
  cd "$ROOT_DIR"
  require_command python3

  log "Starting Apex backend on http://localhost:$APEX_BACKEND_PORT"
  # No PLANE_API_URL-style env pin exists (or is needed) — unlike Taiga's
  # optional TAIGA_API_URL, Plane's identity anchor is always per-request
  # (X-Plane-Url), so the backend stays multi-instance automatically. Paste
  # the tunnel URL into the sidebar as usual.
  #
  # --reload-dir scopes the watch to actual backend code. Bare --reload
  # watches the whole cwd (the repo root) — with --with-frontend also
  # running `next dev` in the same tree, its frontend/.next webpack cache
  # writes constantly and throws uvicorn into a permanent restart storm
  # (found live-testing: 40+ "changes detected" every ~350ms, backend never
  # finishes booting, and mid-flight requests get dropped when it *does*
  # start — the likely cause of a 403 burst seen earlier the same session).
  APEX_STORAGE_BACKEND="${APEX_STORAGE_BACKEND:-local}" \
  python3 -m uvicorn backend.app.main:app --reload \
    --reload-dir "$ROOT_DIR/backend" --reload-dir "$ROOT_DIR/src" \
    --port "$APEX_BACKEND_PORT" &
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
  write_plane_compose
  start_plane

  local tunnel_url
  tunnel_url="$(start_tunnel)"
  retarget_domain "$tunnel_url"

  local token
  token="$(provision_admin)"
  [[ -n "$token" ]] || die "Failed to provision a Plane API token — check: docker logs plane-aio"
  reload_plane_after_provision "$tunnel_url"

  start_backend
  start_frontend

  cat <<EOF

Private Plane test stack is running.

Plane instance URL: $tunnel_url
Plane workspace:     $PLANE_WORKSPACE_SLUG
Plane admin email:   $PLANE_ADMIN_EMAIL
Plane admin password: $PLANE_ADMIN_PASSWORD
Plane API token:     $token
Apex backend:        http://localhost:$APEX_BACKEND_PORT
EOF

  if [[ "$WITH_FRONTEND" == "1" ]]; then
    printf 'Apex frontend:       http://localhost:3000\n'
  fi

  cat <<EOF

In the Apex sidebar: PM tool = Plane, self-hosted instance URL = the tunnel
URL above, then paste the API token above directly. Press Ctrl+C here to
stop the tunnel and Apex processes. Plane's Docker services keep running;
stop them with:
  cd "$PLANE_DIR" && docker compose down

EOF

  wait -n "${PIDS[@]}"
}

main
