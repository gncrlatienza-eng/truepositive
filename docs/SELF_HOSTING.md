# Self-hosting & configuration

Details moved out of the main README. For the free-tier cloud setup (Supabase + Render + Vercel) see [`DEPLOY_FREE.md`](DEPLOY_FREE.md).

## Environment Variables

Copy [`env.example`](env.example) to `.env` and fill in the values. `.env` is gitignored and must never be committed.

| Variable | Used by | Purpose | Example |
|---|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | postgres, backend | Database credentials | dev default `truepositive` / `truepositive` — **must** be a real value before running `docker-compose.prod.yml`, which refuses to start with the dev default |
| `DATABASE_URL` | backend | Postgres connection string | `postgresql://truepositive:truepositive@localhost:5432/truepositive` — only needs to be correct for running the backend standalone (outside Docker); inside Docker, `docker-compose.yml` builds it from `POSTGRES_USER`/`POSTGRES_PASSWORD` above |
| `JWT_SECRET` | backend | Signing key for auth tokens | a long random string |
| `JWT_EXPIRE_MINUTES` | backend | Token lifetime in minutes | `43200` |
| `CORS_ORIGINS` | backend | Comma-separated allowed frontend origins | `http://localhost:3100` |
| `CREDENTIAL_ENCRYPTION_KEY` | backend | Fernet key encrypting remote log-source credentials at rest | output of `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_USE_TLS` | backend | Optional — SMTP config for actually emailing scheduled reports | leave all unset to keep scheduled report delivery log-only; works with any SMTP provider (Gmail, Outlook, a self-hosted relay) |
| `VITE_API_URL` | frontend (build-time) | Overrides the API base URL baked into the frontend build | leave blank — the built-in default is a relative `/api` path, proxied to the backend by nginx (prod) or Vite's dev server (`npm run dev`), so one built image works behind any domain with no rebuild. Only set this if the frontend needs to reach a backend that isn't behind that same-origin proxy. |
| `DOMAIN` | caddy (prod only) | Real domain Caddy requests a Let's Encrypt cert for | `app.example.com` — DNS must already point at the host, ports 80/443 must be internet-reachable |
| `TS_HOSTNAME` | backend (Tailscale overlay only) | Your machine's Tailscale MagicDNS name, used for `CORS_ORIGINS` | `gio.tailnet-name.ts.net` — find it with `tailscale status` |

**Agent download** (dashboard's "Deploy agent" flow): `GET /agents/download/windows` serves `agent/dist/truepositive-agent.exe`, a locally-built binary that's gitignored, not committed — build it once with `pip install pyinstaller && cd agent && pyinstaller tp_agent.spec` (see `agent/README.md`; the tracked `.spec` records the exact build config, including the icon and app name, so build from it rather than a bare `pyinstaller tp_agent.py`). The endpoint 404s with a helpful message until it exists; nothing else in the stack depends on it being built.

## Self-hosted (single VM) via Docker Compose

`docker-compose.yml` alone is a **dev** setup — Postgres bound to loopback, no TLS, dev-default credentials work out of the box with zero config. `docker-compose.prod.yml` is a production overlay (not a replacement) that removes Postgres's host port entirely, requires real secrets (refuses to start on dev defaults), and adds Caddy in front for automatic HTTPS:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec backend alembic upgrade head
```

**Production checklist**, in order:
1. Point your domain's DNS (A/AAAA record) at the host's public IP.
2. Copy `env.example` to `.env` and set real values for `POSTGRES_PASSWORD`, `JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, and `DOMAIN` — `docker-compose.prod.yml` will refuse to start if any of these are missing.
3. Make sure ports 80 and 443 are open to the internet (Caddy needs both for the Let's Encrypt ACME challenge and the certificate itself — see `Caddyfile`'s comments).
4. Run the command above. Caddy obtains and renews the certificate automatically; no manual cert management.
5. Leave `VITE_API_URL` unset — the frontend calls the backend via a same-origin relative path (`/api`), so it doesn't need to know its own domain at build time.

## Deploying over Tailscale (private, no public domain needed)

For reaching the dashboard/backend from your own other devices (a phone, a laptop, a second monitored machine) without exposing anything to the LAN or the public internet — everything stays inside your tailnet. `docker-compose.tailscale.yml` is a third overlay (alongside dev and `docker-compose.prod.yml`) that removes the backend's host port entirely and binds the frontend to `127.0.0.1` only; [`tailscale serve`](https://tailscale.com/kb/1242/tailscale-serve), running as part of the Tailscale daemon already on this host, is what actually proxies HTTPS traffic in from the tailnet and terminates it with a real Tailscale-issued certificate — no Caddy/Let's Encrypt/public domain needed for this path.

**Prerequisites:**
1. Tailscale installed and connected on this host (`tailscale status` should show it as online).
2. **MagicDNS + HTTPS Certificates enabled for your tailnet** — a one-time checkbox in the [Tailscale admin console](https://login.tailscale.com/admin/dns) under DNS settings. `tailscale serve https` fails with a clear error if this is off; easy to miss on a first run.

**Setup:**
```bash
# .env: set TS_HOSTNAME to your real MagicDNS name (from `tailscale status`),
# plus real POSTGRES_PASSWORD / JWT_SECRET / CREDENTIAL_ENCRYPTION_KEY —
# this overlay refuses to start on dev defaults, same as the prod overlay.

docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d --build
docker compose exec backend alembic upgrade head

# One-time, persists across reboots as a background serve config. Check
# `tailscale serve --help` for your installed version — serve's flags have
# changed across Tailscale releases.
tailscale serve --bg https / http://127.0.0.1:3100
```

From any other device on the same tailnet, browse to `https://<TS_HOSTNAME>` — the full dashboard works exactly as it does locally, through the same relative-`/api` + nginx-proxy path. To install an agent on another device: open the dashboard via that same `https://...` address (not `localhost`) when generating credentials in Settings → Sources — the Server URL shown there is derived from the page's own origin, so it'll already be the correct tailnet-reachable address to paste into the agent's connect form / installer / `--url` flag.

## Troubleshooting

- **`docker-compose up` fails on Postgres connection** — confirm `.env` has `DATABASE_URL` matching the `postgres` service name (`postgres`, not `localhost`, inside Docker's network).
- **Backend returns errors about missing tables (`relation "..." does not exist`)** — the schema hasn't been migrated yet; run `docker-compose exec backend alembic upgrade head`.
- **Frontend can't reach the API** — with `VITE_API_URL` left unset (the normal case), the frontend calls a relative `/api` path that nginx (prod build) or Vite's dev server (`npm run dev`) proxies to the backend; confirm the backend is actually reachable at `http://localhost:8000/health` first. If you *did* set `VITE_API_URL`, remember it's baked in at build time — changing `.env` alone won't take effect until you rebuild the frontend image (`docker compose up -d --build frontend`).
- **CI failing on a fresh clone** — make sure the [Environment Variables](#environment-variables) table stays in sync with any new required variable; CI does not have access to real secrets.

