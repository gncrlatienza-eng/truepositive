import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import agents, alerts, auth, dashboard, incidents, logs, playbooks, reports
from app.routes import settings as settings_route

# Root logger defaults to WARNING with no handlers, which silently drops the
# INFO-level app.services.playbook_service "[PLAYBOOK ACTION]" lines that are
# this app's only observable record of a stub automation action having fired.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="TruePositive API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    # A pure JSON API doesn't need CSP, but these apply regardless of
    # content type and cost nothing to set on every response.
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(logs.router)
app.include_router(alerts.router)
app.include_router(incidents.router)
app.include_router(playbooks.router)
app.include_router(reports.router)
app.include_router(settings_route.router)
app.include_router(dashboard.router)


@app.get("/health")
def health():
    return {"status": "ok"}
