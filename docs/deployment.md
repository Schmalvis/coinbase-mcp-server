# Deployment

A multi-arch Docker image is automatically built and pushed to the GitHub Container Registry on every push to `main`.

```
git push → GitHub Actions → ghcr.io/schmalvis/coinbase-mcp-server:latest
```

## Image Tags

| Tag | Description |
|-----|-------------|
| `latest` | Most recent build from `main` |
| `v1.2.3` | Pinned to a specific release |
| `sha-a1b2c3d` | Exact build by git commit |

## Docker Compose (recommended)

```bash
cp .env.example .env      # fill in CDP credentials
docker compose up -d      # start in background
docker compose logs -f    # follow logs
docker compose down       # stop (log volume preserved)
docker compose down -v    # ⚠️ stop AND delete log volume — irreversible
```

See [configuration.md](configuration.md) for all environment variables.

## Docker Run (manual)

```bash
docker run -i \
  -e CDP_API_KEY_ID=your-key-id \
  -e CDP_API_KEY_SECRET=your-api-secret \
  -e CDP_WALLET_SECRET=your-wallet-secret \
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

### Troubleshooting

If Portainer fails with `compose build operation failed`, it is trying to build locally instead of pulling. Ensure:
- The GitHub Actions workflow has completed and pushed the image
- Portainer has credentials to access `ghcr.io` (or the package is public)
- The image tag `latest` exists in the registry
