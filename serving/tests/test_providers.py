import io

import pytest
from PIL import Image

from app.config import get_settings
from app.providers.openfoodfacts import _missing_fields, _num, _request_json, provider_basis


class DummyResponse:
    def __init__(self, payload, status_code=200, raise_error=False):
        self._payload = payload
        self.status_code = status_code
        self._raise = raise_error

    def raise_for_status(self):
        if self._raise:
            raise Exception("HTTP error")

    def json(self):
        return self._payload


def test_num_ok():
    assert _num(100) == 100.0
    assert _num("3.5") == 3.5
    assert _num(None) is None
    assert _num("") is None


def test_missing_fields_calculated():
    assert _missing_fields({"energy-kcal_100g": 100}) == ["protein_g", "fat_g", "carbs_g", "fiber_g"]
    assert _missing_fields({
        "energy-kcal_100g": 100,
        "proteins_100g": 10,
        "fat_100g": 5,
        "carbohydrates_100g": 20,
        "fiber_100g": 3,
    }) == []


def test_request_json_success(monkeypatch):
    def fake_get(url, **kwargs):
        return DummyResponse({"result": True})

    monkeypatch.setattr("app.providers.openfoodfacts.httpx.get", fake_get)
    payload, err = _request_json("http://x.com", 8.0, 2, "test/1.0")
    assert payload == {"result": True}
    assert err is None


def test_request_json_retries(monkeypatch):
    import httpx

    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    monkeypatch.setenv("THRIVELENS_OFF_ENABLED", "1")
    get_settings.cache_clear()

    call_count = 0

    def fake_get(url, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise httpx.ConnectError("transient")
        return DummyResponse({"ok": True})

    monkeypatch.setattr("app.providers.openfoodfacts.httpx.get", fake_get)
    try:
        payload, err = _request_json("http://x.com", 8.0, 3, "test/1.0")
        assert payload == {"ok": True}
        assert call_count == 3
    finally:
        get_settings.cache_clear()


def test_provider_basis_barcode_success(monkeypatch):
    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    monkeypatch.setenv("THRIVELENS_OFF_ENABLED", "1")
    get_settings.cache_clear()

    product = {
        "code": "123456",
        "product_name": "Cola",
        "nutriments": {
            "energy-kcal_100g": 42,
            "proteins_100g": 0,
            "fat_100g": 0,
            "carbohydrates_100g": 10.6,
        },
    }

    def fake_get(url, **kwargs):
        return DummyResponse({"product": product})

    monkeypatch.setattr("app.providers.openfoodfacts.httpx.get", fake_get)
    try:
        basis, err = provider_basis("cola", "123456")
        assert basis is not None
        assert basis.matched_from == "provider"
        assert basis.food_name == "Cola"
        assert basis.source_ref == "123456"
        assert "energy" not in basis.missing_fields
        assert err is None
    finally:
        get_settings.cache_clear()


def test_provider_basis_search_prefers_name_match(monkeypatch):
    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    monkeypatch.setenv("THRIVELENS_OFF_ENABLED", "1")
    get_settings.cache_clear()

    products = [
        {"product_name": "Milk Chocolate Bar", "nutriments": {"energy-kcal_100g": 546}},
        {"product_name": "Banana", "nutriments": {"energy-kcal_100g": 89}},
    ]

    def fake_get(url, **kwargs):
        return DummyResponse({"products": products})

    monkeypatch.setattr("app.providers.openfoodfacts.httpx.get", fake_get)
    try:
        basis, err = provider_basis("chocolate")
        assert basis is not None
        assert "chocolate" in basis.food_name.lower()
    finally:
        get_settings.cache_clear()


def test_provider_basis_unreachable(monkeypatch):
    import httpx

    monkeypatch.setenv("THRIVELENS_SERVING_MOCK", "1")
    monkeypatch.setenv("THRIVELENS_OFF_ENABLED", "1")
    get_settings.cache_clear()

    def fake_get(url, **kwargs):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr("app.providers.openfoodfacts.httpx.get", fake_get)
    try:
        basis, err = provider_basis("anything", "12345")
        assert basis is None
        assert err is not None and "unreachable" in err.lower()
    finally:
        get_settings.cache_clear()
