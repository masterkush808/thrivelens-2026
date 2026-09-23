import json
import os
import time
from typing import Optional, Tuple

import httpx

from ..config import get_settings
from ..contract import MacroSnapshot, NutritionBasis

_NUTRIENT_KEYS = {
    "energy_kcal": "energy-kcal_100g",
    "protein_g": "proteins_100g",
    "fat_g": "fat_100g",
    "carbs_g": "carbohydrates_100g",
    "fiber_g": "fiber_100g",
}


class OpenFoodFactsProviderError(Exception):
    pass


def _cache_path(barcode: str) -> str:
    cache_dir = os.getenv("THRIVELENS_OFF_CACHE_DIR", "")
    if not cache_dir:
        return ""
    return os.path.join(cache_dir, f"off_{barcode}.json")


def _read_cache(barcode: str):
    path = _cache_path(barcode)
    if not path or not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def _write_cache(barcode: str, data) -> None:
    path = _cache_path(barcode)
    if not path:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle)


def _request_json(url: str, timeout: float, retries: int, user_agent: str):
    """GET a JSON payload with bounded retries. Returns (payload, error)."""
    headers = {"User-Agent": user_agent}
    last_error = None
    for attempt in range(retries + 1):
        try:
            response = httpx.get(url, headers=headers, timeout=timeout, follow_redirects=True)
            response.raise_for_status()
            return response.json(), None
        except (httpx.HTTPError, ValueError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(0.5 * (attempt + 1))
    return None, f"{type(last_error).__name__}: {last_error}"


def _barcode_url(settings, barcode: str) -> str:
    return f"{settings.off_api_url}/product/{barcode}.json"


def _search_url(settings, food_name: str) -> str:
    return (
        f"{settings.off_api_url}/search?search_terms={food_name}"
        f"&search_simple=1&json=true&page_size={settings.off_max_results}"
    )


def _pick_product(payload: dict, food_name: str):
    product = payload.get("product")
    if product:
        return product
    products = payload.get("products") or []
    if not products:
        return None
    token = food_name.lower()
    ranked = sorted(
        products,
        key=lambda p: (
            token in str(p.get("product_name", "")).lower(),
            str(p.get("product_name", "")).lower(),
        ),
        reverse=True,
    )
    return ranked[0]


def _missing_fields(nutriments: dict) -> list:
    return [
        display
        for display, off_key in _NUTRIENT_KEYS.items()
        if nutriments.get(off_key) is None
    ]


def _num(value) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def provider_basis(
    food_name: str, barcode: Optional[str] = None
) -> Tuple[Optional[NutritionBasis], Optional[str]]:
    settings = get_settings()
    url = _barcode_url(settings, barcode) if barcode else _search_url(settings, food_name)

    cached = _read_cache(barcode) if barcode else None
    if cached and time.time() - cached.get("fetched_at", 0) < settings.off_cache_ttl_seconds:
        payload = cached.get("data")
    else:
        payload, error = _request_json(
            url, settings.off_timeout_seconds, settings.off_retries, settings.off_user_agent
        )
        if payload is None:
            return None, f"open food facts unreachable: {error}"
        if barcode:
            _write_cache(barcode, {"fetched_at": time.time(), "data": payload})

    product = _pick_product(payload, food_name)
    if not product:
        return None, "no matching product from open food facts"

    nutriments = product.get("nutriments") or {}
    energy_kcal = _num(nutriments.get("energy-kcal_100g", nutriments.get("energy-kcal")))
    if energy_kcal is None:
        return None, "provider product lacks energy data"

    protein = _num(nutriments.get("proteins_100g"))
    fat = _num(nutriments.get("fat_100g"))
    carbs = _num(nutriments.get("carbohydrates_100g"))
    fiber = _num(nutriments.get("fiber_100g"))

    basis = NutritionBasis(
        food_name=product.get("product_name") or food_name or "unknown",
        matched_from="provider",
        source="Open Food Facts",
        source_ref=product.get("code") or (barcode or None),
        freshness="fetched",
        basis="per 100 g",
        per_100g=MacroSnapshot(
            energy_kcal=energy_kcal,
            protein_g=protein if protein is not None else 0.0,
            fat_g=fat if fat is not None else 0.0,
            carbs_g=carbs if carbs is not None else 0.0,
            fiber_g=fiber,
        ),
        missing_fields=_missing_fields(nutriments),
    )
    return basis, None