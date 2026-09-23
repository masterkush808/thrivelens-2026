import io
import os
import time
import uuid

# The Space's gradio endpoints are gated by the caller's HF token, not the
# FastAPI X-API-Key gate. Real (non-mock) mode validates fail-closed that token
# auth is configured, so satisfy it here; the key is not used by gradio handlers.
os.environ.setdefault("THRIVELENS_SERVING_AUTH", "token")
os.environ.setdefault("THRIVELENS_SERVING_API_KEY", "space-gradio-gated")
# Enable the real Open Food Facts provider so barcode nutrition lookups
# work on the Space (public API, no key needed).
os.environ.setdefault("THRIVELENS_OFF_ENABLED", "1")

import spaces  # noqa: F401,E402  # pyright: ignore[reportMissingImports]  must be imported before torch/CUDA (HF runtime only)

import gradio as gr  # noqa: E402  # pyright: ignore[reportMissingImports]  # HF runtime only
from PIL import Image

from app.config import get_settings
from app.model_loader import adapter_sha256, load_model

settings = get_settings()
MODEL, PROCESSOR = load_model(settings.base_model, settings.adapter_dir)


def _revision() -> str:
    return f"{settings.base_model}@{adapter_sha256(settings.adapter_dir)}"


@spaces.GPU(duration=90)
def _run_analysis(image_bytes: bytes) -> dict:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    from app.model_loader import analyze_food

    results = analyze_food(MODEL, PROCESSOR, image, ["food_classification", "ingredient_recognition"])
    candidates = []
    for result in results:
        if not result["valid"]:
            continue
        name = result["answer"] if isinstance(result["answer"], str) else result["task"]
        candidates.append(
            {
                "name": name,
                "task": result["task"],
                "confidence": round(float(result["confidence"]), 4),
            }
        )
    best = max((c["confidence"] for c in candidates), default=0.0)
    abstain = not candidates or best < settings.abstain_confidence
    return {
        "candidate_status": "abstained" if abstain else "candidate",
        "candidates": [] if abstain else candidates,
        "confidence": None if abstain else round(best, 4),
        "abstention_reason": "confidence below abstention threshold" if abstain and candidates else
        ("no valid answer block parsed" if not candidates else None),
        "model_revision": _revision(),
        "is_mock": False,
    }


def analyze(filepath: str) -> dict:
    with open(filepath, "rb") as handle:
        data = handle.read()
    return _run_analysis(data)


@spaces.GPU(duration=90)
def _run_chat(payload: dict) -> dict:
    from pydantic import ValidationError

    from app import coach as coach_module
    from app.contract import CoachRequest
    from app.model_loader import chat as run_chat

    started = time.perf_counter()
    try:
        request = CoachRequest.model_validate(payload)
    except ValidationError as exc:
        return {
            "error": {"code": "invalid_request", "message": f"invalid coach payload: {exc}"},
        }
    rid = request.context.request_id or uuid.uuid4().hex
    refusal = coach_module.policy_refusal(request.messages)
    if refusal:
        response = {
            "request_id": rid,
            "reply": refusal,
            "model_revision": _revision(),
            "confidence": 1.0,
            "refusal": refusal,
            "citations": [{"type": "policy", "label": "safety", "value": "medical/safety refusal"}],
            "proposed_actions": [],
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "is_mock": False,
        }
        return response
    messages = coach_module.build_coach_messages(request.context, request.messages)
    messages = coach_module.cap_chat_context(messages, settings.max_chat_chars)
    if sum(len(message.content) for message in messages) > settings.max_chat_chars:
        return {
            "error": {
                "code": "chat_too_large",
                "message": f"chat context exceeds the {settings.max_chat_chars}-char limit",
            },
        }
    try:
        reply_text, confidence = run_chat(MODEL, PROCESSOR, messages)
        reply_text = coach_module.clean_reply(reply_text)
    except Exception as exc:
        return {
            "error": {"code": "inference_failed", "message": f"coach inference failed: {exc}"},
        }
    actions = [
        action.model_dump()
        for action in coach_module.propose_actions(request.context, request.messages, reply_text)
    ]
    citations = []
    if request.context.profile:
        citations.append({"type": "profile", "label": "profile", "value": "provided profile context"})
    for log in request.context.recent_food_logs[:10]:
        citations.append({"type": "food_log", "label": log.food_name, "value": f"{log.amount_g}g"})
    return {
        "request_id": rid,
        "reply": reply_text,
        "model_revision": _revision(),
        "confidence": round(float(confidence), 4),
        "refusal": None,
        "citations": citations,
        "proposed_actions": actions,
        "latency_ms": int((time.perf_counter() - started) * 1000),
        "is_mock": False,
    }


def chat(payload: dict) -> dict:
    return _run_chat(payload)


def lookup(payload: dict) -> dict:
    from app.catalogue import lookup as lookup_catalogue
    from app.contract import ConfirmedPortion, NutritionLookupRequest, SourceRef
    from app.catalogue import round_one

    try:
        request = NutritionLookupRequest.model_validate(payload)
    except ValueError as exc:
        return {
            "error": {"code": "invalid_request", "message": f"invalid lookup payload: {exc}"},
        }
    rid = request.request_id or uuid.uuid4().hex
    outcome = lookup_catalogue(request.food_name, request.barcode)
    if outcome.basis is None:
        return {
            "request_id": rid,
            "candidate_status": "abstained",
            "food": None,
            "confirmed": None,
            "deterministic": True,
            "abstention_reason": outcome.reason or "no catalogue or provider match for this food",
            "source_refs": [],
            "is_mock": False,
        }
    basis = outcome.basis
    factor = request.amount_g / 100.0
    confirmed = ConfirmedPortion(
        amount_g=round_one(request.amount_g),
        energy_kcal=round_one(basis.per_100g.energy_kcal * factor),
        protein_g=round_one(basis.per_100g.protein_g * factor),
        fat_g=round_one(basis.per_100g.fat_g * factor),
        carbs_g=round_one(basis.per_100g.carbs_g * factor),
        fiber_g=round_one(basis.per_100g.fiber_g * factor)
        if basis.per_100g.fiber_g is not None
        else None,
    )
    ref = SourceRef(type="catalogue" if basis.matched_from == "catalogue" else "provider", value=basis.source_ref or basis.matched_from)
    return {
        "request_id": rid,
        "candidate_status": "candidate",
        "food": basis.model_dump(),
        "confirmed": confirmed.model_dump(),
        "deterministic": True,
        "abstention_reason": None,
        "source_refs": [ref.model_dump()],
        "is_mock": False,
    }


with gr.Blocks(title="ThriveLens Food-R1") as demo:
    image_input = gr.Image(type="filepath", label="Food photo")
    output = gr.JSON(label="Candidates")
    button = gr.Button("Analyze")
    button.click(fn=analyze, inputs=image_input, outputs=output, api_name="analyze")

    chat_input = gr.JSON(label="Coach payload")
    chat_output = gr.JSON(label="Coach reply")
    chat_button = gr.Button("Chat")
    chat_button.click(fn=chat, inputs=chat_input, outputs=chat_output, api_name="chat")

    lookup_input = gr.JSON(label="Lookup payload")
    lookup_output = gr.JSON(label="Nutrition lookup")
    lookup_button = gr.Button("Lookup")
    lookup_button.click(fn=lookup, inputs=lookup_input, outputs=lookup_output, api_name="lookup")

demo.queue().launch(server_name="0.0.0.0", server_port=7860)