from fastapi import APIRouter

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/ping")
def ping():
    return {"router": "agents", "status": "ok"}
