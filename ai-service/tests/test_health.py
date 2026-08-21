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
