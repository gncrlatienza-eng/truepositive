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

Create a `.env` file in the project root (see [Environment Variables](#environment-variables) below for what it needs), then:

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

No `.env.example` is committed — copy the table below into a `.env` file yourself. `.env` is gitignored and must never be committed.

| Variable | Used by | Purpose | Example |
|---|---|---|---|
| `DATABASE_URL` | backend | Postgres connection string | `postgresql://truepositive:truepositive@localhost:5432/truepositive` |
| `JWT_SECRET` | backend | Signing key for auth tokens | a long random string |
| `JWT_EXPIRE_MINUTES` | backend | Token lifetime in minutes | `43200` |
| `CORS_ORIGINS` | backend | Comma-separated allowed frontend origins | `http://localhost:3000` |
| `CREDENTIAL_ENCRYPTION_KEY` | backend | Fernet key encrypting remote log-source credentials at rest | output of `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `VITE_API_URL` | frontend | Base URL the frontend calls for the API | `http://localhost:8000` |

Inside `docker-compose.yml`, `DATABASE_URL` for the `backend` service is already set to point at the `postgres` container — your `.env`'s `DATABASE_URL` only needs to be correct for running the backend standalone (outside Docker).

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

## Troubleshooting

- **`docker-compose up` fails on Postgres connection** — confirm `.env` has `DATABASE_URL` matching the `postgres` service name (`postgres`, not `localhost`, inside Docker's network).
- **Backend returns errors about missing tables (`relation "..." does not exist`)** — the schema hasn't been migrated yet; run `docker-compose exec backend alembic upgrade head`.
- **Frontend can't reach the API** — check `VITE_API_URL` in `.env` matches the backend's exposed port.
- **CI failing on a fresh clone** — make sure the [Environment Variables](#environment-variables) table stays in sync with any new required variable; CI does not have access to real secrets.

## Contributing

Single-maintainer project during the initial 8-week build (see sprint plan). Pull requests welcome once the MVP milestone in `docs/SPRINT_PLAN.md` is reached.
