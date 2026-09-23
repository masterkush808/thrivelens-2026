import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import get_settings
from app.main import app


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def _png_bytes(color=(120, 200, 90)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), color).save(buffer, format="PNG")
    return buffer.getvalue()


def test_healthz_mock(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["mock"] is True
    assert "mock" in body["model_revision"]


def test_analyze_returns_contract(client):
    response = client.post(
        "/v1/food/analyze",
        files={"image": ("meal.png", _png_bytes(), "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["request_id"]
    assert body["candidate_status"] in ("candidate", "abstained")
    assert isinstance(body["candidates"], list)
    if body["candidates"]:
        assert body["confidence"] >= 0.0
    assert body["is_mock"] is True
    assert body["model_revision"].endswith("mock")


def test_analyze_rejects_non_image(client):
    response = client.post(
        "/v1/food/analyze",
        files={"image": ("bad.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 422


def test_analyze_rejects_empty(client):
    response = client.post("/v1/food/analyze", files={"image": ("x.png", b"", "image/png")})
    assert response.status_code == 422


def test_nutrition_deterministic_math(client):
    response = client.post(
        "/v1/nutrition/lookup",
        json={"food_name": "chicken breast", "amount_g": 180},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["candidate_status"] == "candidate"
    assert body["deterministic"] is True
    assert "priority" not in body
    confirmed = body["confirmed"]
    assert confirmed["amount_g"] == 180.0
    assert confirmed["energy_kcal"] == pytest.approx(165.0 * 1.8, abs=0.1)
    assert confirmed["protein_g"] == pytest.approx(31.0 * 1.8, abs=0.1)
    assert body["food"]["basis"] == "per 100 g"
    assert body["food"]["source"]


def test_nutrition_abstains_on_unknown(client):
    response = client.post(
        "/v1/nutrition/lookup",
        json={"food_name": "zqzqx unknown substance 12345", "amount_g": 100},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["candidate_status"] == "abstained"
    assert body["confirmed"] is None
    assert body["abstention_reason"]


def test_nutrition_rejects_invalid_portion(client):
    response = client.post(
        "/v1/nutrition/lookup",
        json={"food_name": "chicken breast", "amount_g": -5},
    )
    assert response.status_code == 422


def test_coach_medical_refusal(client):
    response = client.post(
        "/v1/coach/chat",
        json={
            "context": {"request_id": "rid-1"},
            "messages": [{"role": "user", "content": "Can you diagnose my injury?"}],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["refusal"]
    assert body["citations"][0]["type"] == "policy"


def test_coach_mock_reply_with_citations(client):
    response = client.post(
        "/v1/coach/chat",
        json={
            "context": {
                "request_id": "rid-2",
                "profile": {"weight_kg": 70, "goal": "muscle gain"},
                "recent_food_logs": [
                    {
                        "food_name": "chicken breast",
                        "amount_g": 180,
                        "energy_kcal": 297,
                        "meal_type": "lunch",
                    }
                ],
            },
            "messages": [{"role": "user", "content": "What should I eat tonight?"}],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reply"]
    assert body["is_mock"] is True
    assert any(c["type"] == "profile" for c in body["citations"])
    assert any(c["type"] == "food_log" for c in body["citations"])


def test_coach_mock_proposes_schedule_workout(client):
    response = client.post(
        "/v1/coach/chat",
        json={
            "context": {
                "request_id": "rid-3",
                "profile": {"weight_kg": 70, "goal": "muscle gain"},
            },
            "messages": [{"role": "user", "content": "schedule workouts for this week"}],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_mock"] is True
    assert any(a["type"] == "schedule_workout" for a in body["proposed_actions"])
    assert "schedule workouts" in body["reply"]


def test_token_auth_mode(monkeypatch):
    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    monkeypatch.setenv("THRIVELENS_SERVING_AUTH", "token")
    monkeypatch.setenv("THRIVELENS_SERVING_API_KEY", "test-key")
    get_settings.cache_clear()
    try:
        with TestClient(app) as client:
            unauthorized = client.post("/v1/nutrition/lookup")
            assert unauthorized.status_code in (401, 422)
            authorized = client.post(
                "/v1/nutrition/lookup",
                headers={"X-API-Key": "test-key"},
                json={"food_name": "chicken breast", "amount_g": 100},
            )
            assert authorized.status_code == 200
            assert authorized.json()["candidate_status"] == "candidate"
    finally:
        get_settings.cache_clear()