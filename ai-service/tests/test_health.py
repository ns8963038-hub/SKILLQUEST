from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def test_health_is_public():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_internal_route_requires_valid_key():
    settings.internal_api_key = "secret"  # simulate a configured key

    # no key -> 401
    assert client.get("/internal/ping").status_code == 401
    # wrong key -> 401
    assert client.get("/internal/ping", headers={"X-Internal-Key": "wrong"}).status_code == 401
    # correct key -> 200
    ok = client.get("/internal/ping", headers={"X-Internal-Key": "secret"})
    assert ok.status_code == 200
    assert ok.json()["pong"] is True


def test_dsn_strips_prisma_only_parameters():
    """The backend and this service share one DATABASE_URL, written for Prisma.
    psycopg rejects Prisma's own parameters, so they must be stripped."""
    from app.db import dsn

    base = "postgresql://user:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
    assert dsn(f"{base}?pgbouncer=true") == base
    assert dsn(f"{base}?pgbouncer=true&connection_limit=1&sslmode=require") == f"{base}?sslmode=require"
    assert dsn(base) == base
