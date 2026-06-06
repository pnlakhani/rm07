from fastapi.testclient import TestClient

from app.main import app
from app.models.registry import ModelTask, select_model

client = TestClient(app)


def test_healthz() -> None:
    resp = client.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "ai-svc"


def test_default_model_routing() -> None:
    choice = select_model(ModelTask.AI_MODE_DEFAULT)
    assert choice.provider == "anthropic"
    assert "sonnet" in choice.model
