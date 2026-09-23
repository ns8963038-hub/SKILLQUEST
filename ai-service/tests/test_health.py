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


def test_route_map_is_not_published():
    # An internal service has no reason to publish /docs or its OpenAPI schema.
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_keys_are_compared_safely():
    from app.security import keys_match

    assert keys_match("secret", "secret")
    assert not keys_match("secreT", "secret")
    assert not keys_match("secret", "")  # an unset key never matches
    assert not keys_match(None, "secret")


def test_dsn_strips_prisma_only_parameters():
    """The backend and this service share one DATABASE_URL, written for Prisma.
    psycopg rejects Prisma's own parameters, so they must be stripped."""
    from app.db import dsn

    base = "postgresql://user:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
    assert dsn(f"{base}?pgbouncer=true") == base
    assert dsn(f"{base}?pgbouncer=true&connection_limit=1&sslmode=require") == f"{base}?sslmode=require"
    assert dsn(base) == base
