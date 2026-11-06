from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_check_reports_unreachable_db(monkeypatch):
    from sqlalchemy.exc import OperationalError

    import app.main as main

    def broken_connect():
        raise OperationalError("SELECT 1", {}, Exception("down"))

    monkeypatch.setattr(main.engine, "connect", broken_connect)
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "db_unreachable"}
