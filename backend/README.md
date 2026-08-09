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

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signing key for auth tokens |
| `JWT_EXPIRE_MINUTES` | Token lifetime |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins |

## Folder Layout

```
app/
├── main.py          FastAPI app init, CORS, router registration, health check
├── config.py         Settings loaded from environment
├── database/          SQLAlchemy engine/session setup
├── models/             SQLAlchemy ORM models (one file per table once built)
├── schemas/             Pydantic request/response schemas
├── routes/                auth, agents, logs, alerts, reports, settings — one router per domain
├── services/                Business logic called by routes (kept out of route handlers)
├── utils/                     Helpers: encryption, formatting, validation
└── middleware/                 Auth, request logging, error handling
```

Routes currently ship as stubs (one placeholder endpoint each) wired into `main.py` — real logic lands sprint-by-sprint per [`../docs/SPRINT_PLAN.md`](../docs/SPRINT_PLAN.md).
