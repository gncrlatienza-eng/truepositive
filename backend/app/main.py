from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import agents, alerts, auth, logs, reports, settings as settings_route

app = FastAPI(title="TruePositive API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(logs.router)
app.include_router(alerts.router)
app.include_router(reports.router)
app.include_router(settings_route.router)


@app.get("/health")
def health():
    return {"status": "ok"}
