#!/usr/bin/env bash
# One-time Azure setup for Apex.
# Run once after `az login`:  bash deploy/setup-azure.sh
set -euo pipefail

# ── Config — adjust if needed ────────────────────────────────────────────────
RESOURCE_GROUP="apex-rg"
LOCATION="westeurope"
ENVIRONMENT="apex-env"
APP_NAME="apex"
STORAGE_ACCOUNT="apexctxstore"   # globally unique, 3-24 lowercase alphanum
SHARE_NAME="contextspec"
IMAGE="ghcr.io/thomastabs/bolt-cli:latest"  # matches CI push target
# ─────────────────────────────────────────────────────────────────────────────

echo "==> Registering providers..."
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait

echo "==> Creating resource group: $RESOURCE_GROUP ($LOCATION)"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "==> Creating Container Apps environment: $ENVIRONMENT"
az containerapp env create \
  --name "$ENVIRONMENT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

echo "==> Creating storage account: $STORAGE_ACCOUNT"
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --output none

STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].value" --output tsv)

echo "==> Creating file share: $SHARE_NAME"
az storage share create \
  --name "$SHARE_NAME" \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --output none

echo "==> Linking storage to Container Apps environment"
az containerapp env storage set \
  --name "$ENVIRONMENT" \
  --resource-group "$RESOURCE_GROUP" \
  --storage-name contextspec-mount \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "$SHARE_NAME" \
  --access-mode ReadWrite \
  --output none

echo ""
echo "==> ANTHROPIC_API_KEY — paste your key (input hidden):"
read -rs ANTHROPIC_KEY
echo ""

echo "==> Creating Container App: $APP_NAME"
az containerapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ENVIRONMENT" \
  --image "$IMAGE" \
  --registry-server "ghcr.io" \
  --target-port 8501 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 1 \
  --cpu 0.5 --memory 1.0Gi \
  --secrets "anthropic-key=$ANTHROPIC_KEY" \
  --env-vars "ANTHROPIC_API_KEY=secretref:anthropic-key" \
  --output none

echo "==> Mounting contextspec storage"
az containerapp update \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --volume-mount "volumeName=contextspec-vol,mountPath=/app/contextspec" \
  --scale-rule-name http-rule \
  --scale-rule-type http \
  --scale-rule-http-concurrency 10 \
  --output none 2>/dev/null || true

# Volume definition requires YAML patch — output it for manual apply if needed
cat > /tmp/apex-volume-patch.yaml <<YAML
properties:
  template:
    volumes:
      - name: contextspec-vol
        storageType: AzureFile
        storageName: contextspec-mount
    containers:
      - name: apex
        volumeMounts:
          - volumeName: contextspec-vol
            mountPath: /app/contextspec
YAML
az containerapp update \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --yaml /tmp/apex-volume-patch.yaml \
  --output none 2>/dev/null || echo "  (volume mount patch skipped — apply manually if needed)"

echo ""
echo "==> Creating service principal for GitHub Actions"
SUBSCRIPTION_ID=$(az account show --query id --output tsv)
SP_JSON=$(az ad sp create-for-rbac \
  --name "apex-github-actions" \
  --role contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
  --sdk-auth)

APP_URL=$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv)

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    SETUP COMPLETE                            ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  App URL: https://$APP_URL"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Add this secret to your GitHub repo:                        ║"
echo "║  Settings → Secrets → Actions → New secret                  ║"
echo "║  Name: AZURE_CREDENTIALS                                     ║"
echo "║  Value:                                                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo "$SP_JSON"
