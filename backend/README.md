# TruePositive Backend

FastAPI service: auth, agent management, log ingestion/query, alert rules, incidents, reports, settings.

## Run locally

**Via Docker (recommended):** handled by the root `docker-compose.yml` — nothing to do here directly.

**Standalone:**
```bash
python -m venv .venv
source .venv/bin/activate      # .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Requires a running Postgres instance reachable at `DATABASE_URL`, set in a `.env` file you create yourself (no `.env.example` is committed — see the root [README's Environment Variables section](../README.md#environment-variables)).

## Database

Schema is managed with Alembic. Models live in `app/models/` (one file per table), built on the `Base` declared in `app/database/session.py`.

```bash
# apply all migrations to a fresh (or existing) database
alembic upgrade head

# after changing a model, hand-write or autogenerate a new revision
alembic revision -m "add whatever" --autogenerate

# roll back everything (dev/testing only)
alembic downgrade base
```

Via Docker, run these inside the backend container: `docker-compose exec backend alembic upgrade head`.

## Auth

`POST /auth/signup` creates an org + its first user (role `admin`) and returns a JWT. `POST /auth/login` authenticates an existing user. `GET /auth/me` (Bearer token required) returns the current user + org — used by the frontend to validate a persisted token on load. Passwords are hashed with `bcrypt` directly (see `app/utils/security.py` — passlib's bcrypt backend detection breaks under `bcrypt>=4.1`, so passlib isn't used here).

## Agents & Log Sources

**Enrollment**: `POST /agents` (user JWT) creates a `pending` agent and returns a one-time enrollment key — shown once, stored only as a bcrypt hash (`agent_key_hash`). `POST /agents/{id}/register` and `POST /agents/{id}/heartbeat` (both authenticated via the `X-Agent-Key` header, not a user JWT — see `get_current_agent` in `app/utils/security.py`) flip it to `connected` and track `last_seen_at`. Reads (`GET /agents`, `GET /agents/{id}`) lazily flip a `connected` agent to `disconnected` if it's been more than 90s since its last heartbeat — there's no background scheduler.

**The real agent** (`agent/tp_agent.py`) is a genuine runnable process, not a curl demo — see `agent/README.md`. Both `/agents/download/windows` endpoints serve a pre-built, gitignored `.exe` (bind-mounted from `agent/dist/`, not baked into the image): `GET` returns the raw generic binary; `POST` (user JWT, body `{url, id, key}`, key verified against the stored hash) returns the same binary with that agent's connection details appended after a marker, so the dashboard's "Download agent" button delivers one fully self-contained, pre-configured file.

`DELETE /agents/{id}` removes an agent — any `log_sources` still pointing at it get `agent_id` set to `NULL` rather than being deleted too (a source someone configured is worth keeping even if the agent behind it never connected or gets replaced). Exists specifically so re-generating enrollment credentials without ever connecting (e.g. testing, or Settings → Sources → "Deploy agent" opened more than once) doesn't leave an ever-growing pile of dead `pending` agents with no way to clean them up.

**Log sources** (`/logs/sources`): CRUD with org scoping. Remote (SSH) credentials are Fernet-encrypted at rest (`app/utils/crypto.py`) before storage — no endpoint or schema ever returns the decrypted plaintext, only a derived `has_credential: bool`. WinRM/Syslog protocols and Kerberos auth are accepted by the schema's enums but rejected with 422 — SSH + (key or password) is the only real path this sprint.

**Whitelist** (`/settings/whitelist`): CRUD, `UNIQUE(org_id, type, value)` → 409 on duplicate. `whitelist_service.exclude_whitelisted()` is a reusable query-layer filter meant for Sprint 5's future log/alert list queries — see `tests/test_whitelist.py` for a proof against real `logs` rows, since no log-listing endpoint exists yet.

## Dashboard

`/dashboard/summary?window=24h|7d|30d` and nine `/dashboard/panels/*` endpoints (one per drill-in panel type: critical, ingestion, events, alerts, triage, risk, severity/{severity}, rule/{rule_id}, event-type/{event_type}) — all real SQL aggregation over `logs`/`alerts`/`agents`, org-scoped, no fabricated analytics. Since nothing writes to `logs`/`alerts` yet outside this sprint's seed script (real ingestion is Sprint 5), a fresh org legitimately sees all-zero/empty responses — that's the correct, honest behavior, not a bug. Risk score reuses the UI mockup's own documented weighted formula (Critical×4, High×2, Medium×1, OK×0.3). Agent online/offline counts are computed directly from `last_seen_at` (`agent_service.count_online`) rather than trusting the `status` column, since it's only swept on read. The Alert Queue response (`AlertQueueItem`) has no ack/escalate fields at all — those mutations don't exist until Sprint 5.

### Local dev seed data

`logs`/`alerts` are empty in any real deployment today. To review the dashboard with realistic (not all-zero) numbers locally:

```bash
python scripts/seed_dashboard_data.py <org-slug>
```

Run from `backend/`, against whatever `DATABASE_URL` your environment is already using — inserts sample agents/log sources/alert rules/logs/alerts tied to an *existing* org (looked up by workspace slug; fails loudly if it doesn't exist rather than creating one). Re-running clears its own previously-seeded rows first (safe/idempotent). **Manual-only** — not invoked by `docker-compose.yml` or CI, and should stay that way.

## Code Quality

Enforced in CI (see root [README's Code Quality Standards](../README.md#code-quality-standards)). Config lives in `pyproject.toml`; dev tools in `requirements-dev.txt` (not in the production `requirements.txt`):

```bash
pip install -r requirements-dev.txt   # once, adds ruff + mypy on top of requirements.txt
ruff check .            # lint
ruff format --check .   # formatting (--write to auto-fix)
mypy app                # type checking
pytest                  # needs a reachable Postgres (DATABASE_URL) — exercises real JSONB/enum/UUID columns
```

`auth_service.py`/`security.py` still have no dedicated test coverage (a pre-existing gap from Sprint 2) — `tests/conftest.py`'s fixtures (`client`, `auth_headers`, `db_session`) were built for Sprint 3's agent/log-source/whitelist tests but work equally well for backfilling that.

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signing key for auth tokens |
| `JWT_EXPIRE_MINUTES` | Token lifetime |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins |
| `CREDENTIAL_ENCRYPTION_KEY` | Fernet key encrypting remote log-source credentials at rest |

## Folder Layout

```
backend/
├── alembic.ini        Alembic config
├── alembic/            env.py (wired to app.database.session.Base) + versions/ (migration history)
└── app/
    ├── main.py          FastAPI app init, CORS, router registration, health check
    ├── config.py         Settings loaded from environment
    ├── database/          SQLAlchemy engine/session setup
    ├── models/             SQLAlchemy ORM models, one file per table
    ├── schemas/             Pydantic request/response schemas
    ├── routes/                auth, agents, logs, alerts, reports, settings, dashboard — one router per domain
    ├── services/                Business logic called by routes (kept out of route handlers)
    ├── utils/                     Helpers: encryption, formatting, validation
    └── middleware/                 Auth, request logging, error handling
```

`auth`, `agents`, `logs` (sources), `settings` (whitelist), and `dashboard` now have real endpoints (see the sections above). `alerts` and `reports` still ship as stubs (one placeholder endpoint each) wired into `main.py` — real logic lands sprint-by-sprint per [`../docs/SPRINT_PLAN.md`](../docs/SPRINT_PLAN.md).
