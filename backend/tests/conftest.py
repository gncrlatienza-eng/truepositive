import os

# app.config.Settings requires JWT_SECRET/CREDENTIAL_ENCRYPTION_KEY with no
# default (fails fast on a real missing secret) — tests need placeholders
# before app.main is ever imported. Fixed values, never used for anything real.
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-real-use")
os.environ.setdefault("CREDENTIAL_ENCRYPTION_KEY", "KMpxRR-i1Th9aZAoc-KvHHjMwj6GIII5mK-coU656-8=")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import Base, get_db
from app.main import app
from app.utils.rate_limit import reset as reset_rate_limits

engine = create_engine(settings.database_url, pool_pre_ping=True)


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    # Tables from app.models' Base.metadata — independent of Alembic, so
    # tests work against a fresh CI database with no migration history too.
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture()
def db_session():
    # Standard SQLAlchemy 2.0 pattern for isolating a test inside a
    # transaction that's rolled back afterward, even though the app's own
    # service-layer code calls session.commit() internally: those commits
    # only end a nested savepoint, not the outer connection-level transaction.
    connection = engine.connect()
    outer_transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer_transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db_session):
    def _get_db_override():
        yield db_session

    app.dependency_overrides[get_db] = _get_db_override
    # Rate limiting is process-global state, not per-request DB state — reset
    # it alongside the db_session's own isolation so one test's request
    # volume never trips a limit for the next test.
    reset_rate_limits()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _signup(client, email: str, slug: str) -> dict:
    response = client.post(
        "/auth/signup",
        json={
            "full_name": "Test User",
            "email": email,
            "password": "TestPass123",
            "org_name": "Test Org",
            "team_size": "1-5 analysts",
            "workspace_slug": slug,
            "agree_terms": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture()
def auth_headers(client):
    data = _signup(client, "fixture-user@example.com", "fixture-org")
    return {"Authorization": f"Bearer {data['access_token']}"}


@pytest.fixture()
def second_org_headers(client):
    data = _signup(client, "fixture-user-2@example.com", "fixture-org-2")
    return {"Authorization": f"Bearer {data['access_token']}"}
