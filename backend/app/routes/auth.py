from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/ping")
def ping():
    return {"router": "auth", "status": "ok"}
