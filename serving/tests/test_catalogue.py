import io

import pytest
from PIL import Image

from app.catalogue import LookupOutcome, local_basis, lookup, valid_barcode, round_one, _snapshot, _canonical_phrase


def _tiny_png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), (255, 0, 0)).save(buf, format="PNG")
    return buf.getvalue()


# ------------------------------------------------------------------
# Matching correctness
# ------------------------------------------------------------------
def test_exact_key_match():
    out = lookup("chicken breast")
    assert out.basis is not None
    assert out.basis.food_name == "chicken breast"
    assert out.basis.per_100g.protein_g == pytest.approx(31.0)


def test_plural_resolves_to_singular():
    out = lookup("eggs")
    assert out.basis is not None
    assert out.basis.food_name == "egg"


def test_alias_match():
    out = lookup("french fries")
    assert out.basis is not None
    assert out.basis.food_name == "fries"


def test_apple_pie_not_apple():
    out = lookup("apple pie")
    assert out.basis is not None
    assert out.basis.food_name == "apple pie"
    assert out.basis.per_100g.carbs_g == pytest.approx(34.0)


def test_prep_words_stripped():
    out = lookup("grilled whole chicken breast")
    assert out.basis is not None
    assert out.basis.food_name == "chicken breast"


def test_unknown_abstains():
    out = lookup("zqzqx unknown substance 12345")
    assert out.basis is None
    assert out.reason is not None and "no catalogue" in out.reason.lower()


def test_barcode_valid():
    assert valid_barcode("5901234123457") is True


def test_barcode_invalid():
    assert valid_barcode("1234567890123") is False


def test_barcode_abstains_when_off_disabled():
    out = lookup("soda", barcode="5901234123457")
    assert out.basis is None
    assert out.reason is not None


def test_salt_missing_fields():
    out = lookup("salt")
    assert out.basis is not None
    assert out.basis.missing_fields == ["protein_g", "fat_g", "carbs_g", "fiber_g"]


def test_local_basis_ignores_barcode():
    assert local_basis("chicken breast", barcode="5901234123457") is None


def test_round_one():
    assert round_one(12.345) == 12.3
    assert round_one(0) == 0.0


def test_snapshot():
    m = _snapshot((100.0, 10.0, 5.0, 15.0, 3.0))
    assert m.energy_kcal == 100.0
    assert m.fiber_g == 3.0


def test_canonical_phrase():
    assert _canonical_phrase("Grilled Whole Eggs") == "egg"
    assert _canonical_phrase("apples") == "apple"
