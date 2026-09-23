import json
import re
from dataclasses import dataclass
from typing import Optional, Union

_ANSWER_RE = re.compile(r"<answer>(.*?)</answer>", re.I | re.S)

CLASSIFICATION_TASKS = ("food_classification", "produce_variety_classification")
STRUCTURED_TASKS = ("ingredient_recognition",)


@dataclass(frozen=True)
class ExtractResult:
    answer: Optional[Union[str, list[str]]]
    valid: bool
    raw_block: str


def answer_block(text: str) -> str:
    match = _ANSWER_RE.search(text or "")
    return (match.group(1) if match else (text or "")).strip()


def _collapse(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip()


def extract_ingredients(block: str):
    if not block.startswith("{"):
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    items = data.get("ingredients")
    if not isinstance(items, list):
        return None
    cleaned = [str(item).strip() for item in items if str(item).strip()]
    return cleaned or None


def extract(task: str, text: str) -> ExtractResult:
    block = answer_block(text)
    if task in CLASSIFICATION_TASKS:
        name = _collapse(block)
        return ExtractResult(answer=name, valid=bool(name), raw_block=block)
    if task in STRUCTURED_TASKS:
        ingredients = extract_ingredients(block)
        return ExtractResult(answer=ingredients, valid=ingredients is not None, raw_block=block)
    cleaned = _collapse(block)
    return ExtractResult(answer=cleaned, valid=bool(cleaned), raw_block=block)