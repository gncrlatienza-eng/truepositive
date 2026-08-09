from fastapi import APIRouter

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/ping")
def ping():
    return {"router": "logs", "status": "ok"}
