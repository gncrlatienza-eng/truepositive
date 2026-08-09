from fastapi import APIRouter

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/ping")
def ping():
    return {"router": "alerts", "status": "ok"}
