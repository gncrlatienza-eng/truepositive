from fastapi import APIRouter

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/ping")
def ping():
    return {"router": "settings", "status": "ok"}
