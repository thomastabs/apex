# Apex Azure deployment backup

Snapshot of Apex's Azure Container Apps deployment taken on 2026-11-09, ahead of a possible decommission of the Azure subscription. The deployment is still live; this folder holds everything needed to recreate it from scratch if the subscription is ever cancelled.

## What was deployed

| Resource | Details |
|---|---|
| Resource group | `apex-rg` (resources in `francecentral`) |
| Container Apps environment | `apex-env`, Consumption workload profile only, no log destination |
| `apex-backend` | `ghcr.io/thomastabs/apex-backend:sha-e654d80`, port 8000, external ingress, 0.5 CPU / 1Gi, min 1 / max 1 replicas, Azure File Share mounted at `/app/contextspec` |
| `apex-frontend` | `ghcr.io/thomastabs/apex-frontend:sha-e654d80`, port 3000, external ingress, 0.5 CPU / 1Gi, min 0 / max 2 replicas, custom domains `apex-bolt.com` and `www.apex-bolt.com` (Azure managed certificates, CNAME validation, DNS at GoDaddy) |
| Storage account | `apexctxstore`, Standard_LRS StorageV2, File Share `contextspec` (100 GiB quota, TransactionOptimized) holding all Apex workflow state |
| Log Analytics | `apex-logs`, not wired to the environment, not needed |
| Redis | Not on Azure. `REDIS_URL` points at an external Upstash instance |

Not on Azure and unaffected by the cancellation: the container images (GHCR), the Cloudflare Taiga relay Worker (`infra/cloudflare/taiga-relay`), Upstash Redis, and GoDaddy DNS.

## Files in this folder

| File | Tracked in git | Contents |
|---|---|---|
| `apex-backend.containerapp.json`, `apex-frontend.containerapp.json` | yes | full `az containerapp show` output with every env var and secret value replaced by `<stripped ...>` |
| `apex-env.json`, `apex-env.storage.json`, `certs.json` | yes | environment, its File Share links, managed certificates |
| `apexctxstore.json`, `share.json` | yes | storage account and share settings (keys stripped) |
| `redeploy.sh` | yes | recreates the whole stack from scratch |
| `secrets.local.env` | **no** (gitignored, mode 600) | every env var and Container App secret value, as `APP__NAME="value"` |
| `files/` | **no** (gitignored) | full copy of the `contextspec` File Share: 1977 files, 81 directories, 12,739,568 bytes, verified file by file against the share |

`secrets.local.env` and `files/` exist only on the machine that ran the backup. Keep an encrypted copy somewhere else (password manager or an encrypted archive), because they cannot be recovered from Azure once the subscription is gone.

`AI_KEY_ENCRYPTION_SECRET` is the most important value in `secrets.local.env`. Per-project GitHub PATs and AI keys inside `files/` are encrypted with it, so restoring `files/` without that secret leaves them unreadable. Users would have to re-enter them.

## Container images

CI (`.github/workflows/ci.yml`, `build-backend` / `build-frontend`) builds both images from this repo and pushes them to GHCR on every push to `main`, tagged `sha-<7 chars>` and `latest`. The exact images that were last deployed are `sha-e654d80` and are public in GHCR. If they are ever gone, rebuild from commit `e654d80`:

```bash
docker build -f backend/Dockerfile -t ghcr.io/thomastabs/apex-backend:sha-e654d80 .
docker build -f frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://<backend-fqdn> \
  -t ghcr.io/thomastabs/apex-frontend:sha-e654d80 .
```

`NEXT_PUBLIC_API_BASE_URL` is baked into the frontend at build time. If the backend URL changes, the frontend image must be rebuilt with the new value.

## Redeploying

1. Get an Azure subscription and run `az login`. Install the extension with `az extension add -n containerapp`.
2. Make sure `secrets.local.env` and `files/` are in this folder.
3. Review `redeploy.sh`, then run it. Pick a fresh storage account name, because `apexctxstore` may not be available again:

   ```bash
   SUBSCRIPTION=<id> STORAGE_ACCOUNT=<globally-unique-name> ./deploy-backup/azure/redeploy.sh
   ```

   It creates the resource group, storage account and share, uploads `files/` into the share, creates the environment with the share linked, and creates both apps with the original secrets, env vars, scale settings and volume mount. The storage connection string is rebuilt from the new account's key. The backed-up one points at the deleted account and is not reused.
4. If the backend URL changed:
   - set the GitHub repo secret `NEXT_PUBLIC_API_BASE_URL` to the new backend URL, then rebuild and redeploy the frontend image;
   - update the backend `ALLOWED_ORIGINS` env var to include the new frontend origin.
5. Custom domain (optional): point the `apex-bolt.com` / `www` records at GoDaddy to the new frontend, then add each hostname with `az containerapp hostname add` and `az containerapp hostname bind --validation-method CNAME` (or HTTP for the apex domain), which issues new managed certificates.
6. CI/CD and scaling:
   - create a service principal scoped to the new resource group;
   - store its JSON as the `AZURE_CREDENTIALS` repo secret;
   - restore the `deploy` job in `ci.yml` (removed in the decommission commit, recoverable from git history);
   - re-enable the scale scheduler with `gh workflow enable scale-scheduler.yml`.
7. Smoke test: `curl https://<backend-fqdn>/api/health` should return 200, then load the frontend.

Redis is optional. With `REDIS_URL` empty, the backend runs as the single writer it was designed as (keep `maxReplicas` at 1). If the Upstash instance still exists, the backed-up URL works as is.

## Running without Azure

Apex also runs fully locally with no cloud dependencies. Use `docker-compose.yml` or the commands in `CLAUDE.md`. Copy `files/` into `./contextspec/` and leave `AZURE_STORAGE_CONNECTION_STRING` unset (or set `APEX_STORAGE_BACKEND=local`) to use the backed-up data from local disk.
