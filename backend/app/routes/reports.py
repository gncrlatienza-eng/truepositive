from fastapi import APIRouter

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/ping")
def ping():
    return {"router": "reports", "status": "ok"}
