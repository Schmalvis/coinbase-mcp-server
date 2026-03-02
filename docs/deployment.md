# Deployment

A `linux/arm64` Docker image is automatically built and pushed to the GitHub Container Registry on every push to `main`.

```
git push → GitHub Actions → ghcr.io/schmalvis/coinbase-mcp-server:latest
```

## Image Tags

| Tag | Description |
|-----|-------------|
| `latest` | Most recent build from `main` |
| `v1.2.3` | Pinned to a specific release |
| `1.2` | Latest patch within a minor version |
| `sha-a1b2c3d` | Exact build by git commit |

## Docker Compose

```bash
docker compose up -d      # start in background
docker compose logs -f    # follow logs
docker compose down       # stop (wallet volume is preserved)
docker compose down -v    # ⚠️ stop AND delete wallet volume — irreversible
```

`stack.env` is loaded automatically by Compose. See [configuration.md](configuration.md) for values.

## Docker Run (manual)

```bash
docker run -i \
  -e CDP_API_KEY_NAME=your-key-id \
  -e CDP_API_KEY_PRIVATE_KEY=your-base64-key \
  -e NETWORK_ID=base-sepolia \
  -p 3002:3002 \
  -v coinbase_wallet_data:/app/data \
  ghcr.io/schmalvis/coinbase-mcp-server:latest
```

## Portainer (GitOps)

### One-time setup

1. **Add the registry** (if the package is private on GitHub)
   - Portainer → Settings → Registries → Add registry
   - Type: `Custom registry`, URL: `ghcr.io`
   - Username: `schmalvis`, Password: a GitHub PAT with `read:packages` scope

2. **Create the stack**
   - Portainer → Stacks → Add stack → Git Repository
   - URL: `https://github.com/Schmalvis/coinbase-mcp-server`
   - Compose path: `docker-compose.yml`
   - Set credential env vars in Portainer's environment UI (keeps secrets out of git)

3. **Deploy** — Portainer pulls the image from ghcr.io and starts the container

4. **Web UI** — `http://<portainer-host-ip>:3002`

### Keeping deployments up to date

- **Auto-update (polling):** Enable in Portainer stack settings — detects new image digests automatically
- **Webhook (event-driven):** Copy the Portainer redeploy webhook URL, add it to GitHub repo secrets as `PORTAINER_WEBHOOK_URL`, then add to the workflow:

```yaml
- name: Trigger Portainer redeploy
  run: curl -X POST "${{ secrets.PORTAINER_WEBHOOK_URL }}"
```

### Troubleshooting Portainer builds

If you see `compose build operation failed: The command '/bin/sh -c npm ci' returned a non-zero code: 1`, Portainer is trying to build the image locally instead of pulling it. The `docker-compose.yml` no longer contains a `build:` directive — it pulls from ghcr.io directly. Check that:

- The GitHub Actions workflow has completed at least once and pushed the image
- Portainer has credentials to access ghcr.io (or the package is public)
- The image tag `latest` exists in the registry
