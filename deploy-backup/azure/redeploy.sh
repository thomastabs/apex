#!/usr/bin/env bash
# Recreate Apex's Azure Container Apps deployment from scratch.
#
# Mirrors the topology that ran in production until 2026-11 (see the exported
# *.json files next to this script for the exact original configuration):
#   resource group -> storage account + Azure File Share "contextspec"
#   -> Container Apps environment (Consumption profile) with the share linked
#   -> apex-backend  (FastAPI, port 8000, min=1 max=1, share mounted at /app/contextspec)
#   -> apex-frontend (Next.js, port 3000, min=0 max=2)
#
# Prerequisites: az CLI logged in (`az login`), `containerapp` extension,
# python3, and deploy-backup/azure/secrets.local.env present (never committed).
# Redis is NOT recreated here: REDIS_URL pointed at an external Upstash
# instance, not an Azure resource. Leave REDIS_URL empty to run single-replica.
#
# Usage:  ./redeploy.sh            (defaults below, override via env vars)
#         SUBSCRIPTION=<id> STORAGE_ACCOUNT=<unique-name> ./redeploy.sh
#
# This script has NOT been executed as part of the decommission; review it
# before running.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SECRETS="$HERE/secrets.local.env"

SUBSCRIPTION="${SUBSCRIPTION:-}"
RG="${RG:-apex-rg}"
LOCATION="${LOCATION:-francecentral}"
ENV_NAME="${ENV_NAME:-apex-env}"
# Storage account names are globally unique. The old "apexctxstore" may not be
# reusable for a while after the old subscription is deleted; pick another.
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-apexctxstore}"
SHARE="${SHARE:-contextspec}"
ENV_STORAGE_NAME="${ENV_STORAGE_NAME:-contextspec-store}"
BACKEND_IMAGE="${BACKEND_IMAGE:-ghcr.io/thomastabs/apex-backend:sha-e654d80}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-ghcr.io/thomastabs/apex-frontend:sha-e654d80}"
RESTORE_FILES="${RESTORE_FILES:-1}"   # 1 = upload ./files/ into the new share

[ -f "$SECRETS" ] || { echo "missing $SECRETS"; exit 1; }
[ -n "$SUBSCRIPTION" ] && az account set --subscription "$SUBSCRIPTION"

# Load secrets.local.env (values are JSON-quoted strings).
eval "$(python3 -I - "$SECRETS" <<'PY'
import json, shlex, sys
for line in open(sys.argv[1]):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    print(f"export {k}={shlex.quote(json.loads(v))}")
PY
)"

echo "== resource group"
az group create -n "$RG" -l "$LOCATION" -o none

echo "== storage account + file share"
az storage account create -n "$STORAGE_ACCOUNT" -g "$RG" -l "$LOCATION" \
  --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 \
  --allow-blob-public-access false -o none
az storage share-rm create --storage-account "$STORAGE_ACCOUNT" -g "$RG" \
  -n "$SHARE" --quota 100 --access-tier TransactionOptimized -o none
STORAGE_KEY="$(az storage account keys list -n "$STORAGE_ACCOUNT" -g "$RG" --query '[0].value' -o tsv)"
# A new storage account has a new key, so the backed-up connection string is
# stale; rebuild it instead of reusing APEX_BACKEND__AZURE_STORAGE_CONNECTION_STRING.
export NEW_STORAGE_CONN="DefaultEndpointsProtocol=https;AccountName=${STORAGE_ACCOUNT};AccountKey=${STORAGE_KEY};EndpointSuffix=core.windows.net"

if [ "$RESTORE_FILES" = "1" ] && [ -d "$HERE/files" ]; then
  echo "== restoring File Share contents from ./files"
  az storage file upload-batch --account-name "$STORAGE_ACCOUNT" --account-key "$STORAGE_KEY" \
    --destination "$SHARE" --source "$HERE/files" --no-progress -o none
fi

echo "== Container Apps environment (Consumption)"
az containerapp env create -n "$ENV_NAME" -g "$RG" -l "$LOCATION" \
  --logs-destination none -o none
az containerapp env storage set -n "$ENV_NAME" -g "$RG" \
  --storage-name "$ENV_STORAGE_NAME" --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" --azure-file-share-name "$SHARE" \
  --access-mode ReadWrite -o none
ENV_ID="$(az containerapp env show -n "$ENV_NAME" -g "$RG" --query id -o tsv)"

echo "== apex-backend"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export ENV_ID LOCATION BACKEND_IMAGE ENV_STORAGE_NAME SHARE
python3 -I - "$TMP/backend.yaml" <<'PY'
import json, os, sys
e = os.environ
g = lambda k: e.get("APEX_BACKEND__" + k, "")
secrets = {
    "anthropic-key": g("SECRET__anthropic_key"),
    "azure-storage": e["NEW_STORAGE_CONN"],
    "langchain-api-key": g("SECRET__langchain_api_key"),
    "openai-api-key": g("SECRET__openai_api_key"),
    "google-api-key": g("SECRET__google_api_key"),
    "redis-url": g("SECRET__redis_url"),
    "ai-key-encryption-secret": g("SECRET__ai_key_encryption_secret"),
}
secret_env = {
    "ANTHROPIC_API_KEY": "anthropic-key",
    "AZURE_STORAGE_CONNECTION_STRING": "azure-storage",
    "LANGCHAIN_API_KEY": "langchain-api-key",
    "OPENAI_API_KEY": "openai-api-key",
    "GOOGLE_API_KEY": "google-api-key",
    "REDIS_URL": "redis-url",
    "AI_KEY_ENCRYPTION_SECRET": "ai-key-encryption-secret",
}
plain_env = ["AZURE_FILE_SHARE_NAME", "ALLOWED_ORIGINS", "LANGCHAIN_TRACING_V2",
             "LANGCHAIN_PROJECT", "TAIGA_EGRESS_RELAY", "TAIGA_EGRESS_RELAY_SECRET"]
# Container Apps rejects empty secret values; drop unset ones and their env refs.
secrets = {k: v for k, v in secrets.items() if v}
env = [{"name": n, "secretRef": s} for n, s in secret_env.items() if s in secrets]
env += [{"name": n, "value": g(n)} for n in plain_env]
doc = {
    "location": e["LOCATION"],
    "properties": {
        "managedEnvironmentId": e["ENV_ID"],
        "configuration": {
            "activeRevisionsMode": "Single",
            "ingress": {"external": True, "targetPort": 8000, "transport": "Auto"},
            "secrets": [{"name": k, "value": v} for k, v in secrets.items()],
        },
        "template": {
            "containers": [{
                "name": "apex-backend", "image": e["BACKEND_IMAGE"],
                "resources": {"cpu": 0.5, "memory": "1Gi"},
                "env": env,
                "volumeMounts": [{"volumeName": "contextspec-vol", "mountPath": "/app/contextspec"}],
            }],
            # Single writer: do NOT raise maxReplicas unless REDIS_URL is set and verified.
            "scale": {"minReplicas": 1, "maxReplicas": 1},
            "volumes": [{"name": "contextspec-vol", "storageType": "AzureFile",
                         "storageName": e["ENV_STORAGE_NAME"]}],
        },
    },
}
fd = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, json.dumps(doc).encode()); os.close(fd)   # JSON is valid YAML
PY
az containerapp create -n apex-backend -g "$RG" --yaml "$TMP/backend.yaml" -o none
BACKEND_FQDN="$(az containerapp show -n apex-backend -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)"
echo "backend: https://$BACKEND_FQDN"

echo "== apex-frontend"
# NEXT_PUBLIC_API_BASE_URL is baked into the image at BUILD time (CI build-arg
# from the NEXT_PUBLIC_API_BASE_URL repo secret). The runtime env var below is
# kept for parity, but if the backend URL changed you must rebuild the frontend
# image with the new value (see README.md).
az containerapp create -n apex-frontend -g "$RG" --environment "$ENV_NAME" \
  --image "$FRONTEND_IMAGE" --ingress external --target-port 3000 \
  --cpu 0.5 --memory 1Gi --min-replicas 0 --max-replicas 2 \
  --env-vars "NEXT_PUBLIC_API_BASE_URL=https://$BACKEND_FQDN" -o none
FRONTEND_FQDN="$(az containerapp show -n apex-frontend -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)"
echo "frontend: https://$FRONTEND_FQDN"

cat <<EOF

Done. Remaining manual steps (README.md):
  1. Update backend ALLOWED_ORIGINS if the frontend origin changed.
  2. Rebuild the frontend image if the backend URL changed.
  3. Custom domain apex-bolt.com: repoint GoDaddy DNS, then
     az containerapp hostname add/bind for apex-bolt.com and www.apex-bolt.com.
  4. Create a new AZURE_CREDENTIALS service principal for GitHub Actions and
     restore the deploy job / scale-scheduler workflow.
EOF
