import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

from app.ratelimit import SlidingWindowLimiter, make_rate_limit_middleware


@pytest.fixture
def limited_app():
    test_app = FastAPI()

    @test_app.get("/limited")
    def limited():
        return {"ok": True}

    @test_app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    test_app.add_middleware(make_rate_limit_middleware(2, 60))
    return test_app


def test_limiter_allows_up_to_limit():
    limiter = SlidingWindowLimiter(limit=3, window_seconds=60)
    for _ in range(3):
        assert limiter.check("ip") == (True, 0.0)
    allowed, retry_after = limiter.check("ip")
    assert allowed is False
    assert retry_after > 0.0


def test_limiter_allows_different_keys_independently():
    limiter = SlidingWindowLimiter(limit=1, window_seconds=60)
    assert limiter.check("a") == (True, 0.0)
    assert limiter.check("a")[0] is False
    assert limiter.check("b") == (True, 0.0)


def test_limiter_clear_resets_window():
    limiter = SlidingWindowLimiter(limit=1, window_seconds=60)
    limiter.check("a")
    assert limiter.check("a")[0] is False
    limiter.clear("a")
    assert limiter.check("a") == (True, 0.0)


def test_limiter_rejects_negative_limit():
    with pytest.raises(ValueError):
        SlidingWindowLimiter(limit=-1, window_seconds=60)


def test_limiter_zero_disables():
    limiter = SlidingWindowLimiter(limit=0, window_seconds=60)
    for _ in range(20):
        assert limiter.check("x") == (True, 0.0)


def test_limiter_expires_old_events():
    limiter = SlidingWindowLimiter(limit=1, window_seconds=0.05)
    assert limiter.check("a") == (True, 0.0)
    assert limiter.check("a")[0] is False
    time.sleep(0.07)
    assert limiter.check("a") == (True, 0.0)


def test_middleware_allows_within_limit(limited_app):
    with TestClient(limited_app) as client:
        assert client.get("/limited").status_code == 200
        assert client.get("/limited").status_code == 200


def test_middleware_returns_429_after_limit(limited_app):
    with TestClient(limited_app) as client:
        assert client.get("/limited").status_code == 200
        assert client.get("/limited").status_code == 200
        response = client.get("/limited")
        assert response.status_code == 429
        body = response.json()
        assert body["error"]["code"] == "rate_limited"
        assert "Retry-After" in response.headers


def test_middleware_exempts_healthz(limited_app):
    with TestClient(limited_app) as client:
        for _ in range(10):
            assert client.get("/healthz").status_code == 200