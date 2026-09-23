import os
import re
from dataclasses import dataclass
from typing import Optional

from .contract import MacroSnapshot, NutritionBasis

SOURCE_LABEL = (
    "USDA FoodData Central reference values (curated beta, per 100 g). "
    "Approximate cooked/edible values; not a substitute for a tailored food test."
)

# (energy_kcal, protein_g, fat_g, carbs_g, fiber_g)
_CATALOGUE = {
    # Proteins
    "chicken breast": (165.0, 31.0, 3.6, 0.0, 0.0),
    "chicken": (215.0, 18.0, 15.0, 0.0, 0.0),
    "chicken thigh": (209.0, 26.0, 10.0, 0.0, 0.0),
    "chicken wings": (203.0, 18.0, 14.0, 0.0, 0.0),
    "fried chicken": (246.0, 17.0, 14.0, 9.0, 0.0),
    "turkey breast": (135.0, 29.0, 1.0, 0.0, 0.0),
    "beef": (250.0, 26.0, 15.0, 0.0, 0.0),
    "beef steak": (271.0, 25.0, 19.0, 0.0, 0.0),
    "ground beef": (258.0, 25.0, 17.0, 0.0, 0.0),
    "pork chop": (231.0, 26.0, 14.0, 0.0, 0.0),
    "bacon": (541.0, 37.0, 42.0, 1.4, 0.0),
    "ham": (145.0, 21.0, 5.5, 1.5, 0.0),
    "lamb": (294.0, 25.0, 21.0, 0.0, 0.0),
    "salmon": (208.0, 20.0, 13.0, 0.0, 0.0),
    "tuna": (132.0, 28.0, 1.0, 0.0, 0.0),
    "cod": (82.0, 18.0, 0.7, 0.0, 0.0),
    "tilapia": (96.0, 20.0, 1.7, 0.0, 0.0),
    "shrimp": (99.0, 24.0, 0.3, 0.2, 0.0),
    "egg": (143.0, 13.0, 9.5, 0.7, 0.0),
    "egg white": (52.0, 11.0, 0.2, 0.7, 0.0),
    "tofu": (76.0, 8.0, 4.8, 1.9, 0.3),
    # Dairy
    "milk": (42.0, 3.4, 1.0, 5.0, 0.0),
    "whole milk": (61.0, 3.2, 3.3, 4.8, 0.0),
    "skim milk": (34.0, 3.4, 0.1, 5.0, 0.0),
    "yogurt": (59.0, 10.0, 0.4, 4.7, 0.0),
    "greek yogurt": (73.0, 10.0, 0.4, 3.9, 0.0),
    "kefir": (64.0, 3.5, 3.6, 4.8, 0.0),
    "cheese": (402.0, 25.0, 33.0, 1.3, 0.0),
    "cheddar": (403.0, 25.0, 33.0, 1.3, 0.0),
    "mozzarella": (280.0, 28.0, 17.0, 3.1, 0.0),
    "parmesan": (431.0, 38.0, 29.0, 4.1, 0.0),
    "cream cheese": (342.0, 6.0, 34.0, 4.0, 0.0),
    "sour cream": (198.0, 2.4, 19.0, 4.6, 0.0),
    "butter": (717.0, 0.9, 81.1, 0.1, 0.0),
    # Grains / starches
    "rice": (130.0, 2.7, 0.3, 28.2, 0.4),
    "white rice": (130.0, 2.7, 0.3, 28.2, 0.4),
    "brown rice": (123.0, 2.7, 0.4, 25.6, 1.6),
    "quinoa": (120.0, 4.4, 1.9, 21.3, 2.8),
    "couscous": (112.0, 3.8, 0.2, 23.2, 1.4),
    "pasta": (158.0, 5.8, 0.9, 30.9, 1.8),
    "bread": (265.0, 9.0, 3.2, 49.0, 4.0),
    "whole wheat bread": (247.0, 13.0, 3.4, 41.0, 7.0),
    "bagel": (250.0, 10.0, 1.5, 50.0, 2.0),
    "croissant": (406.0, 8.0, 21.0, 46.0, 2.6),
    "tortilla": (310.0, 8.0, 7.0, 49.0, 3.0),
    "naan": (262.0, 8.7, 5.6, 46.0, 2.0),
    "oats": (389.0, 16.9, 6.9, 66.3, 10.6),
    "oatmeal": (71.0, 2.5, 1.5, 12.0, 1.7),
    "granola": (471.0, 10.0, 20.0, 64.0, 7.0),
    "pancakes": (227.0, 6.0, 9.0, 30.0, 1.0),
    "waffles": (291.0, 7.9, 9.0, 42.0, 2.0),
    "crackers": (450.0, 8.0, 13.0, 70.0, 3.0),
    "potato": (77.0, 2.0, 0.1, 17.0, 2.2),
    "sweet potato": (86.0, 1.6, 0.1, 20.1, 3.0),
    "potato chips": (536.0, 7.0, 35.0, 53.0, 3.1),
    # Legumes
    "beans": (127.0, 8.7, 0.5, 22.8, 6.4),
    "black beans": (132.0, 8.9, 0.5, 23.7, 8.7),
    "kidney beans": (127.0, 8.7, 0.5, 22.8, 6.4),
    "lentils": (116.0, 9.0, 0.4, 20.1, 7.9),
    "chickpeas": (164.0, 8.9, 2.6, 27.4, 7.6),
    "peas": (81.0, 5.4, 0.4, 14.5, 5.7),
    # Vegetables
    "broccoli": (34.0, 2.8, 0.4, 6.6, 2.6),
    "carrot": (41.0, 0.9, 0.2, 9.6, 2.8),
    "tomato": (18.0, 0.9, 0.2, 3.9, 1.2),
    "cucumber": (15.0, 0.7, 0.1, 3.6, 0.5),
    "spinach": (23.0, 2.9, 0.4, 3.6, 2.2),
    "kale": (49.0, 4.3, 0.9, 8.8, 3.6),
    "cabbage": (25.0, 1.3, 0.1, 5.8, 2.5),
    "cauliflower": (25.0, 1.9, 0.3, 5.0, 2.0),
    "lettuce": (15.0, 1.4, 0.2, 2.9, 1.3),
    "onion": (40.0, 1.1, 0.1, 9.3, 1.7),
    "garlic": (149.0, 6.4, 0.5, 33.1, 2.1),
    "bell pepper": (31.0, 1.0, 0.3, 6.0, 2.1),
    "celery": (14.0, 0.7, 0.2, 3.0, 1.6),
    "zucchini": (17.0, 1.2, 0.3, 3.1, 1.0),
    "eggplant": (25.0, 1.0, 0.2, 5.9, 3.0),
    "mushroom": (22.0, 3.1, 0.3, 3.3, 1.0),
    "corn": (86.0, 3.3, 1.4, 19.0, 2.0),
    "peas": (81.0, 5.4, 0.4, 14.5, 5.7),
    "vegetables": (63.0, 2.8, 0.7, 13.2, 3.5),
    "avocado": (160.0, 2.0, 14.7, 8.5, 6.7),
    # Fruits
    "apple": (52.0, 0.3, 0.2, 13.8, 2.4),
    "banana": (89.0, 1.1, 0.3, 22.8, 2.6),
    "orange": (47.0, 0.9, 0.1, 11.8, 2.4),
    "strawberries": (32.0, 0.7, 0.3, 7.7, 2.0),
    "blueberries": (57.0, 0.7, 0.3, 14.5, 2.4),
    "raspberries": (52.0, 1.2, 0.7, 11.9, 6.5),
    "blackberries": (43.0, 1.4, 0.5, 9.6, 5.3),
    "grapes": (69.0, 0.7, 0.2, 18.1, 0.9),
    "watermelon": (30.0, 0.6, 0.2, 7.6, 0.4),
    "cantaloupe": (34.0, 0.8, 0.2, 8.2, 0.9),
    "peach": (39.0, 0.9, 0.3, 9.5, 1.5),
    "pear": (57.0, 0.4, 0.1, 15.2, 3.1),
    "mango": (60.0, 0.8, 0.4, 15.0, 1.6),
    "pineapple": (50.0, 0.5, 0.1, 13.1, 1.4),
    "kiwi": (61.0, 1.1, 0.5, 14.7, 3.0),
    "lemon": (29.0, 1.1, 0.3, 9.3, 2.8),
    "lime": (30.0, 0.7, 0.2, 10.5, 2.8),
    # Nuts & seeds
    "peanuts": (567.0, 25.8, 49.2, 16.1, 8.5),
    "nuts": (607.0, 20.0, 54.0, 21.0, 7.0),
    "almonds": (579.0, 21.2, 49.9, 21.6, 12.5),
    "cashews": (553.0, 18.2, 43.9, 30.2, 3.3),
    "walnuts": (654.0, 15.2, 65.2, 13.7, 6.7),
    "pistachios": (560.0, 20.2, 45.3, 27.2, 10.6),
    "sunflower seeds": (584.0, 20.8, 51.5, 20.0, 8.6),
    "chia seeds": (486.0, 16.5, 30.7, 42.1, 34.4),
    # Spreads / condiments / prepared foods
    "peanut butter": (588.0, 25.0, 50.0, 20.0, 6.0),
    "hummus": (166.0, 7.9, 9.6, 14.3, 6.0),
    "guacamole": (160.0, 2.0, 15.0, 9.0, 7.0),
    "salsa": (29.0, 1.5, 0.2, 6.0, 1.8),
    "ketchup": (101.0, 1.0, 0.2, 25.8, 0.3),
    "mustard": (66.0, 4.4, 3.3, 5.0, 3.3),
    "mayonnaise": (680.0, 1.0, 75.0, 0.6, 0.0),
    "honey": (304.0, 0.3, 0.0, 82.4, 0.2),
    "maple syrup": (260.0, 0.0, 0.0, 67.0, 0.0),
    "jam": (250.0, 0.4, 0.1, 65.0, 0.6),
    "ice cream": (207.0, 3.5, 11.0, 24.0, 0.7),
    "apple pie": (237.0, 1.9, 11.0, 34.0, 1.6),
    "pizza": (266.0, 11.0, 10.0, 33.0, 2.3),
    "burger": (295.0, 17.0, 16.0, 20.0, 0.0),
    "fries": (312.0, 3.4, 15.0, 41.0, 3.8),
    "lasagna": (130.0, 7.0, 4.0, 15.0, 1.5),
    "omelette": (154.0, 10.6, 10.4, 0.7, 0.0),
    "chocolate": (546.0, 4.9, 31.0, 61.0, 3.4),
    "sugar": (387.0, 0.0, 0.0, 100.0, 0.0),
    "salt": (0.0, 0.0, 0.0, 0.0, 0.0),  # sodium-only; macros intentionally missing
    # Beverages
    "orange juice": (45.0, 0.7, 0.2, 10.4, 0.2),
    "tea": (1.0, 0.0, 0.0, 0.0, 0.0),
    "coffee": (2.0, 0.3, 0.0, 0.0, 0.0),
}

# Canonical aliases: normalized phrase -> catalogue key. Covers non-singular
# phrases whose meaning differs from a token-level lemmatised match.
_ALIASES = {
    "french fries": "fries",
    "fries fried": "fries",
    "sweet potato fries": "sweet potato",
    "chicken breast skinless": "chicken breast",
    "whole eggs": "egg",
    "pineapple juice": "orange juice",  # nearest-equivalent, flagged in missing fields
}

# Descriptor words that do not change the food identity.
_PREP_WORDS = frozenset(
    {
        "grilled", "baked", "roasted", "boiled", "fried", "deep-fried", "deepfried",
        "steamed", "sauteed", "saute", "sautéed", "pan-fried", "panfried", "broiled",
        "poached", "microwaved", "stewed", "simmered", "braised", "raw", "fresh",
        "frozen", "dried", "canned", "diced", "chopped", "sliced", "mashed",
        "shredded", "minced", "grated", "whole", "plain", "homemade", "seasoned",
        "marinated", "smoked", "curried", "spicy", "hot", "cold", "sweet", "savoury",
        "savory", "skinless", "boneless", "lean", "extralean", "organic",
        "low-fat", "lowfat", "non-fat", "nonfat", "fatfree", "cooked", "uncooked",
        "cured", "aged", "creamy", "crunchy", "crispy", "freshly", "lightly",
        "with", "and", "of", "in", "on", "from", "a", "an", "the", "some",
        "plus", "extra", "my", "your", "no", "without", "make", "making",
    }
)

_NON_WORD = re.compile(r"[^a-z0-9\s]")


def _normalize(name: str) -> str:
    return _NON_WORD.sub(" ", (name or "").lower())


def _tokens(name: str) -> list:
    return [token for token in _normalize(name).split()]


def _lemma(token: str) -> str:
    if token.endswith("ies") and len(token) > 4:
        return token[:-3] + "y"
    if token.endswith("oes") and len(token) > 4:
        return token[:-2]
    if token.endswith("s") and len(token) > 3 and token[-2:] != "ss":
        return token[:-1]
    return token


def _canonical_phrase(name: str) -> str:
    tokens = [t for t in _tokens(name) if t not in _PREP_WORDS]
    return " ".join(_lemma(t) for t in tokens)


def _leaf_match(key: str) -> str:
    return " ".join(_lemma(t) for t in key.split())


# Lemmatised lookup map so plurals and singular forms resolve to one key.
_LEAF = {_leaf_match(key): key for key in _CATALOGUE}


def _find_key(food_name: str) -> Optional[str]:
    canonical = _canonical_phrase(food_name)
    if not canonical:
        return None
    key = _LEAF.get(canonical)
    if key:
        return key
    raw_phrase = " ".join(_tokens(food_name))
    if raw_phrase in _ALIASES:
        return _ALIASES[raw_phrase]
    return None


def _missing_fields(key: str) -> list:
    if key == "salt":
        return ["protein_g", "fat_g", "carbs_g", "fiber_g"]
    return []


def local_basis(food_name: str, barcode: Optional[str] = None) -> Optional[NutritionBasis]:
    if barcode:
        return None
    key = _find_key(_normalize(food_name))
    if key is None:
        return None
    return NutritionBasis(
        food_name=key,
        matched_from="catalogue",
        source=SOURCE_LABEL,
        source_ref="usda-fdc-curated",
        freshness="static",
        basis="per 100 g",
        per_100g=_snapshot(_CATALOGUE[key]),
        missing_fields=_missing_fields(key),
    )


def valid_barcode(barcode: str) -> bool:
    digits = re.sub(r"\D", "", str(barcode))
    if len(digits) not in (8, 13):
        return False
    check = int(digits[-1])
    body = digits[:-1]
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


@dataclass(frozen=True)
class LookupOutcome:
    basis: Optional[NutritionBasis] = None
    reason: Optional[str] = None
    source_refs: tuple = ()


def lookup(food_name: str, barcode: Optional[str] = None) -> LookupOutcome:
    if barcode and not valid_barcode(barcode):
        return LookupOutcome(None, "barcode failed checksum validation")
    basis = local_basis(food_name, barcode)
    if basis is not None:
        return LookupOutcome(basis)
    if os.getenv("THRIVELENS_OFF_ENABLED", "").lower() in ("1", "true", "yes"):
        from .providers.openfoodfacts import provider_basis

        candidate, error = provider_basis(food_name, barcode)
        if candidate is not None:
            return LookupOutcome(candidate)
        return LookupOutcome(None, f"provider: {error or 'no provider match'}")
    return LookupOutcome(None, "no catalogue match for this food")


def round_one(value: float) -> float:
    return round(float(value), 1)


def _snapshot(values) -> MacroSnapshot:
    energy, protein, fat, carbs, fiber = values
    return MacroSnapshot(
        energy_kcal=energy,
        protein_g=protein,
        fat_g=fat,
        carbs_g=carbs,
        fiber_g=fiber,
    )