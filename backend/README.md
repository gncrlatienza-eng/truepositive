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

## Code Quality

Enforced in CI (see root [README's Code Quality Standards](../README.md#code-quality-standards)). Config lives in `pyproject.toml`; dev tools in `requirements-dev.txt` (not in the production `requirements.txt`):

```bash
pip install -r requirements-dev.txt   # once, adds ruff + mypy on top of requirements.txt
ruff check .            # lint
ruff format --check .   # formatting (--write to auto-fix)
mypy app                # type checking
pytest                  # currently just tests/test_health.py — auth_service.py/security.py have no coverage yet
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signing key for auth tokens |
| `JWT_EXPIRE_MINUTES` | Token lifetime |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins |

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
    ├── routes/                auth, agents, logs, alerts, reports, settings — one router per domain
    ├── services/                Business logic called by routes (kept out of route handlers)
    ├── utils/                     Helpers: encryption, formatting, validation
    └── middleware/                 Auth, request logging, error handling
```

`auth` now has real endpoints (see Auth section above). The rest (`agents`, `logs`, `alerts`, `reports`, `settings`) still ship as stubs (one placeholder endpoint each) wired into `main.py` — real logic lands sprint-by-sprint per [`../docs/SPRINT_PLAN.md`](../docs/SPRINT_PLAN.md).
