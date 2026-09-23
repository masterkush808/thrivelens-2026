import io

import pytest
from PIL import Image

from app.config import get_settings


def _tiny_png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), (100, 200, 50)).save(buf, format="PNG")
    return buf.getvalue()


def test_pixel_limit_rejects_huge_dimensions(monkeypatch):
    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    monkeypatch.setenv("THRIVELENS_MAX_UPLOAD_PIXELS", "1000")
    monkeypatch.delenv("THRIVELENS_SERVING_AUTH", raising=False)
    monkeypatch.delenv("THRIVELENS_SERVING_API_KEY", raising=False)
    get_settings.cache_clear()
    try:
        from app.main import app
        from fastapi.testclient import TestClient

        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/v1/food/analyze",
                files={"image": ("meal.png", _tiny_png(), "image/png")},
            )
            assert resp.status_code == 413
            body = resp.json()
            detail = body.get("detail") or body.get("error", {})
            assert detail.get("code") == "image_dimensions_too_large"
    finally:
        get_settings.cache_clear()


def test_chat_char_limit_rejects_large_context(monkeypatch):
    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    monkeypatch.setenv("THRIVELENS_MAX_CHAT_CHARS", "50")
    monkeypatch.delenv("THRIVELENS_SERVING_AUTH", raising=False)
    monkeypatch.delenv("THRIVELENS_SERVING_API_KEY", raising=False)
    get_settings.cache_clear()
    try:
        from app.main import app
        from fastapi.testclient import TestClient

        with TestClient(app, raise_server_exceptions=False) as client:
            long_msg = "x" * 60
            resp = client.post(
                "/v1/coach/chat",
                json={
                    "context": {"request_id": "r1"},
                    "messages": [{"role": "user", "content": long_msg}],
                },
            )
            assert resp.status_code == 413
            body = resp.json()
            detail = body.get("detail") or body.get("error", {})
            assert detail.get("code") == "chat_too_large"
    finally:
        get_settings.cache_clear()


def test_chat_char_limit_trims_oversized_multiturn(monkeypatch):
    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    # Grounding context now carries clock + location blocks (standard, ~210
    # chars + the last message). 600 keeps the minimal (grounding + newest)
    # below the cap while forcing the 300-char middle message to be trimmed.
    monkeypatch.setenv("THRIVELENS_MAX_CHAT_CHARS", "600")
    monkeypatch.delenv("THRIVELENS_SERVING_AUTH", raising=False)
    monkeypatch.delenv("THRIVELENS_SERVING_API_KEY", raising=False)
    get_settings.cache_clear()
    try:
        from app.main import app
        from fastapi.testclient import TestClient

        with TestClient(app, raise_server_exceptions=False) as client:
            messages = [
                {"role": "user", "content": "t" * 200},
                {"role": "assistant", "content": "u" * 300},
                {"role": "user", "content": "what should I eat today?"},
            ]
            resp = client.post(
                "/v1/coach/chat",
                json={"context": {"request_id": "r-trim"}, "messages": messages},
            )
            assert resp.status_code == 200
    finally:
        get_settings.cache_clear()


def test_auth_token_rejects_empty_key(monkeypatch):
    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    monkeypatch.setenv("THRIVELENS_SERVING_AUTH", "token")
    monkeypatch.setenv("THRIVELENS_SERVING_API_KEY", "real-key")
    get_settings.cache_clear()
    try:
        from app.main import app
        from fastapi.testclient import TestClient

        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/v1/nutrition/lookup",
                json={"food_name": "egg", "amount_g": 100},
            )
            assert resp.status_code == 401
    finally:
        get_settings.cache_clear()


def test_auth_wrong_key_rejected(monkeypatch):
    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    monkeypatch.setenv("THRIVELENS_SERVING_AUTH", "token")
    monkeypatch.setenv("THRIVELENS_SERVING_API_KEY", "correct-key")
    get_settings.cache_clear()
    try:
        from app.main import app
        from fastapi.testclient import TestClient

        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/v1/nutrition/lookup",
                headers={"X-API-Key": "wrong-key"},
                json={"food_name": "egg", "amount_g": 100},
            )
            assert resp.status_code == 401
    finally:
        get_settings.cache_clear()


def test_settings_rejects_unknown_auth_mode(monkeypatch):
    monkeypatch.setenv("THRIVELENS_SERVING_AUTH", "banana")
    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    get_settings.cache_clear()
    try:
        with pytest.raises(ValueError, match="unknown"):
            get_settings()
    finally:
        get_settings.cache_clear()


def test_settings_rejects_token_with_empty_key(monkeypatch):
    monkeypatch.setenv("THRIVELENS_SERVING_AUTH", "token")
    monkeypatch.setenv("THRIVELENS_SERVING_API_KEY", "")
    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    get_settings.cache_clear()
    try:
        with pytest.raises(ValueError, match="non-empty"):
            get_settings()
    finally:
        get_settings.cache_clear()
