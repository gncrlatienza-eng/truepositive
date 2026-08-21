# TruePositive

**Goal: a beginner-friendly SIEM** — log analysis and alert triage built to teach people new to security operations how detection actually works, not just another enterprise console tuned for veteran analysts. Real SIEMs (Splunk, Sentinel, QRadar) bury newcomers under configuration and jargon before they ever see a useful alert; TruePositive aims for the same core workflow — ingest events, score them against tunable rules, surface only what deserves attention — with a UI and onboarding path a new learner can actually follow.

> Status: early scaffold. See [`docs/SPRINT_PLAN.md`](docs/SPRINT_PLAN.md) for the active 8-week build plan and what's implemented so far.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Mobile (Phase 2) | React Native + Expo |
| Backend | FastAPI (Python) |
| Database | PostgreSQL |
| Containerization | Docker + Docker Compose |
| CI | GitHub Actions — see [Code Quality Standards](#code-quality-standards) |

Why PostgreSQL over a document store: the data model is inherently relational (users → orgs → agents → log sources → logs → alerts → incidents), needs multi-table joins and audit trails for compliance, and benefits from ACID transactions when an alert triggers an automated playbook action.

## Architecture

```
                 ┌──────────────┐
  Analyst  ───▶  │  Frontend    │  React + Vite, served behind nginx in prod
                 │  (frontend/) │
                 └──────┬───────┘
                        │ REST (JWT auth)
                 ┌──────▼───────┐
                 │  Backend API │  FastAPI — auth, agents, logs, alerts,
                 │  (backend/)  │  incidents, reports, settings
                 └──────┬───────┘
                        │ SQL
                 ┌──────▼───────┐
                 │  PostgreSQL  │  users, orgs, agents, log_sources, logs,
                 │              │  alerts, alert_rules, incidents, reports,
                 └──────────────┘  whitelist_entries, audit_log

  Deployed agents (Windows/Linux/Docker/K8s) ship logs to the Backend API
  over TLS after enrolling with credentials issued during onboarding.
```

## Quick Start

Copy `env.example` to `.env` and fill in the required secrets (see [Environment Variables](#environment-variables) below), then:

```bash
docker-compose up -d
docker-compose exec backend alembic upgrade head   # applies the schema (first run / after pulling new migrations)
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000 (health check at `/health`)
- Postgres: localhost:5432

Or use the setup script, which installs dependencies for local (non-Docker) development — it will remind you to create `.env` if one isn't there yet, but won't create it for you:

```bash
./scripts/setup.sh      # macOS/Linux
./scripts/setup.ps1     # Windows PowerShell
```

## Environment Variables

Copy [`env.example`](env.example) to `.env` and fill in the values. `.env` is gitignored and must never be committed.

| Variable | Used by | Purpose | Example |
|---|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | postgres, backend | Database credentials | dev default `truepositive` / `truepositive` — **must** be a real value before running `docker-compose.prod.yml`, which refuses to start with the dev default |
| `DATABASE_URL` | backend | Postgres connection string | `postgresql://truepositive:truepositive@localhost:5432/truepositive` — only needs to be correct for running the backend standalone (outside Docker); inside Docker, `docker-compose.yml` builds it from `POSTGRES_USER`/`POSTGRES_PASSWORD` above |
| `JWT_SECRET` | backend | Signing key for auth tokens | a long random string |
| `JWT_EXPIRE_MINUTES` | backend | Token lifetime in minutes | `43200` |
| `CORS_ORIGINS` | backend | Comma-separated allowed frontend origins | `http://localhost:3000` |
| `CREDENTIAL_ENCRYPTION_KEY` | backend | Fernet key encrypting remote log-source credentials at rest | output of `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `VITE_API_URL` | frontend (build-time) | Overrides the API base URL baked into the frontend build | leave blank — the built-in default is a relative `/api` path, proxied to the backend by nginx (prod) or Vite's dev server (`npm run dev`), so one built image works behind any domain with no rebuild. Only set this if the frontend needs to reach a backend that isn't behind that same-origin proxy. |
| `DOMAIN` | caddy (prod only) | Real domain Caddy requests a Let's Encrypt cert for | `app.example.com` — DNS must already point at the host, ports 80/443 must be internet-reachable |
| `TS_HOSTNAME` | backend (Tailscale overlay only) | Your machine's Tailscale MagicDNS name, used for `CORS_ORIGINS` | `gio.tailnet-name.ts.net` — find it with `tailscale status` |

**Agent download** (dashboard's "Deploy agent" flow): `GET /agents/download/windows` serves `agent/dist/truepositive-agent.exe`, a locally-built binary that's gitignored, not committed — build it once with `pip install pyinstaller && cd agent && pyinstaller tp_agent.spec` (see `agent/README.md`; the tracked `.spec` records the exact build config, including the icon and app name, so build from it rather than a bare `pyinstaller tp_agent.py`). The endpoint 404s with a helpful message until it exists; nothing else in the stack depends on it being built.

## Project Structure

```
truepositive/
├── frontend/    React + Vite web dashboard — see frontend/README.md
├── mobile/      React Native + Expo app (Phase 2, minimal scaffold) — see mobile/README.md
├── backend/     FastAPI server — see backend/README.md
├── agent/       Standalone log-collection agent (script + packaged Windows .exe) — see agent/README.md
├── docker/      Dockerfiles + nginx config — see docker/README.md
├── scripts/     Setup/dev scripts — see scripts/README.md
├── docs/        Sprint plan and specs — see docs/README.md
├── reference/   Local-only mockup/manifest, gitignored — not part of this repo
├── .github/workflows/   CI
└── docker-compose.yml
```

## Development Workflow

1. Check [`docs/SPRINT_PLAN.md`](docs/SPRINT_PLAN.md) for the current sprint's goal and task list.
2. Build against the UI mockup as the source of truth for every screen, color, and interaction. It lives in `reference/` (gitignored — not part of this repo) rather than committed; ask the project owner if you need a copy.
3. Run the stack locally (`docker-compose up`) and verify the change against the relevant screen before committing.
4. Commit and push yourself — generated code is reviewed first, never auto-committed.

## Code Quality Standards

Every push/PR runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml), which enforces:

| Layer | Lint / Format | Type checking | Tests |
|---|---|---|---|
| Backend (Python) | [`ruff`](https://docs.astral.sh/ruff/) (lint + format, one tool) — config in `backend/pyproject.toml` | `mypy` | `pytest` — see `backend/README.md` |
| Frontend (JS/React) | ESLint (`eslint-plugin-react` + `eslint-plugin-react-hooks`) + Prettier — config in `frontend/eslint.config.js` / `.prettierrc.json` | — (plain JS, no TypeScript) | — none yet, see `frontend/README.md` |

Run locally before committing: `backend/README.md` and `frontend/README.md` each have the exact commands for their layer. A few deliberate calls worth knowing about:

- **`ruff`'s `B008` rule is relaxed for FastAPI's `Depends(...)`-in-default-arg pattern** (that's the framework's own recommended style, not a bug) — see the `extend-immutable-calls` comment in `backend/pyproject.toml`.
- **`alembic/versions/` is excluded from ruff** — migrations are a generated historical record, not hand-maintained style.
- **Frontend test coverage is zero** — `pytest` has one smoke test (`backend/tests/test_health.py`); nothing on the frontend yet. Both are open follow-up work, not blocking CI today.

## Security

See [`SECURITY.md`](SECURITY.md) for the standard we align to (OWASP ASVS), an honest map of what's covered vs. known gaps, and how to report a vulnerability.

## Deployment

- **Frontend:** Vercel (or any static host — `frontend/` builds to a static bundle).
- **Backend:** Railway or Render (containerized via `docker/Dockerfile.backend`).
- **Database:** managed Postgres (Supabase recommended for MVP — built-in auth/storage if you outgrow the custom auth layer; migrate to self-hosted/AWS RDS at scale).

### Self-hosted (single VM) via Docker Compose

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

### Deploying over Tailscale (private, no public domain needed)

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
tailscale serve --bg https / http://127.0.0.1:3000
```

From any other device on the same tailnet, browse to `https://<TS_HOSTNAME>` — the full dashboard works exactly as it does locally, through the same relative-`/api` + nginx-proxy path. To install an agent on another device: open the dashboard via that same `https://...` address (not `localhost`) when generating credentials in Settings → Sources — the Server URL shown there is derived from the page's own origin, so it'll already be the correct tailnet-reachable address to paste into the agent's connect form / installer / `--url` flag.

## Troubleshooting

- **`docker-compose up` fails on Postgres connection** — confirm `.env` has `DATABASE_URL` matching the `postgres` service name (`postgres`, not `localhost`, inside Docker's network).
- **Backend returns errors about missing tables (`relation "..." does not exist`)** — the schema hasn't been migrated yet; run `docker-compose exec backend alembic upgrade head`.
- **Frontend can't reach the API** — with `VITE_API_URL` left unset (the normal case), the frontend calls a relative `/api` path that nginx (prod build) or Vite's dev server (`npm run dev`) proxies to the backend; confirm the backend is actually reachable at `http://localhost:8000/health` first. If you *did* set `VITE_API_URL`, remember it's baked in at build time — changing `.env` alone won't take effect until you rebuild the frontend image (`docker compose up -d --build frontend`).
- **CI failing on a fresh clone** — make sure the [Environment Variables](#environment-variables) table stays in sync with any new required variable; CI does not have access to real secrets.

## Contributing

Single-maintainer project during the initial 8-week build (see sprint plan). Pull requests welcome once the MVP milestone in `docs/SPRINT_PLAN.md` is reached.
