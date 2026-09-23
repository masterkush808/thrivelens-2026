import asyncio
import io
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError

from . import coach as coach_module
from .catalogue import lookup, round_one
from .config import get_settings
from .ratelimit import make_rate_limit_middleware
from .contract import (
    AnalyzeResponse,
    Citation,
    CoachAction,
    CoachContext,
    CoachRequest,
    ConfirmedPortion,
    CoachResponse,
    FoodCandidate,
    NutritionBasis,
    NutritionLookupRequest,
    NutritionLookupResponse,
    SourceRef,
)

MOCK_MODEL_REVISION = "zy12123/Food-R1@mock"

documented_candidates = [
    {"name": "Chicken Breast", "task": "food_classification", "confidence": 0.95},
    {"name": "Rice", "task": "food_classification", "confidence": 0.92},
    {"name": "Vegetables", "task": "food_classification", "confidence": 0.88},
]


def model_revision(settings) -> str:
    if settings.mock:
        return MOCK_MODEL_REVISION
    from . import model_loader

    return f"{settings.base_model}@{model_loader.adapter_sha256(settings.adapter_dir)}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.mock = settings.mock
    app.state.model = None
    app.state.processor = None
    if not settings.mock:
        from . import model_loader

        try:
            app.state.model, app.state.processor = model_loader.load_model(
                settings.base_model, settings.adapter_dir
            )
        except Exception as exc:
            raise RuntimeError(
                f"failed to initialise real serving mode (mock=0); refusing to start: {exc}"
            ) from exc
    yield
    app.state.model = None
    app.state.processor = None


app = FastAPI(
    title="ThriveLens Food-R1 Serving",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    make_rate_limit_middleware(
        get_settings().rate_limit_requests,
        get_settings().rate_limit_window_seconds,
    )
)


async def require_auth(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    settings = get_settings()
    if settings.auth_mode == "token":
        if not settings.api_key or not x_api_key:
            raise HTTPException(status_code=401, detail="invalid or missing API key")
        if not secrets.compare_digest(x_api_key.strip(), settings.api_key):
            raise HTTPException(status_code=401, detail="invalid or missing API key")
    return True


def _structured_error(status_code: int, code: str, message: str):
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def _decode_image(data: bytes, settings):
    try:
        image = Image.open(io.BytesIO(data))
        width, height = image.size
        if width * height > settings.max_upload_pixels:
            raise HTTPException(
                status_code=413,
                detail={
                    "code": "image_dimensions_too_large",
                    "message": (
                        f"image dimensions {width}x{height} exceed the "
                        f"{settings.max_upload_pixels}-pixel limit"
                    ),
                },
            )
        image.load()
        image = ImageOps.exif_transpose(image)
        return image.convert("RGB")
    except HTTPException:
        raise
    except Image.DecompressionBombError as exc:
        raise _structured_error(413, "image_decompression_bomb", "image exceeds decompression limits") from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise _structured_error(422, "invalid_image", "uploaded bytes are not a readable image") from exc


def _mock_analyze() -> List[dict]:
    base = [
        {
            "task": item["task"],
            "raw": "",
            "answer": item["name"],
            "confidence": item["confidence"],
            "valid": True,
        }
        for item in documented_candidates
    ]
    base.append(
        {
            "task": "ingredient_recognition",
            "raw": "",
            "answer": ["chicken", "rice", "vegetables"],
            "confidence": 0.8,
            "valid": True,
        }
    )
    return base


def _build_analyze_response(request_id: str, results: List[dict], latency_ms: int, settings, mock: bool):
    candidates = []
    for result in results:
        if not result["valid"]:
            continue
        name = ""
        if isinstance(result["answer"], str):
            name = result["answer"]
        elif isinstance(result["answer"], list):
            name = result["task"]
        candidates.append(
            FoodCandidate(
                name=name,
                task=result["task"],
                confidence=float(result["confidence"]),
                raw=result["raw"],
            )
        )
    best = max((c.confidence for c in candidates), default=0.0)
    abstain = best < settings.abstain_confidence
    return AnalyzeResponse(
        request_id=request_id,
        model_revision=model_revision(settings),
        candidate_status="abstained" if abstain else "candidate",
        candidates=candidates if not abstain else [],
        confidence=round(best, 4) if candidates else None,
        abstention_reason=(
            "confidence below abstention threshold" if abstain and candidates else
            ("no valid answer block parsed" if not candidates else None)
        ),
        source_refs=[SourceRef(type="mock" if mock else "model", value=model_revision(settings))],
        latency_ms=latency_ms,
        is_mock=mock,
    )


@app.get("/healthz")
def healthz():
    settings = get_settings()
    model_ready = settings.mock or app.state.model is not None
    return {
        "status": "ok",
        "mock": settings.mock,
        "model_revision": model_revision(settings),
        "model_ready": model_ready,
    }


@app.post(
    "/v1/food/analyze",
    response_model=AnalyzeResponse,
    responses={
        401: {"description": "missing or invalid API key"},
        413: {"description": "image too large"},
        422: {"description": "invalid image"},
    },
)
async def analyze_food(
    image: UploadFile = File(...),
    request_id: str = Form(""),
    _auth: bool = Depends(require_auth),
):
    settings = get_settings()
    rid = request_id or uuid.uuid4().hex
    data = await image.read()
    if not data:
        raise _structured_error(422, "empty_image", "no image bytes supplied")
    if len(data) > settings.max_image_bytes:
        raise _structured_error(413, "image_too_large", "image exceeds size limit")
    pil_image = _decode_image(data, settings)
    started = time.perf_counter()
    if settings.mock:
        results = _mock_analyze()
    else:
        tasks = ["food_classification", "ingredient_recognition"]
        from .model_loader import analyze_food as run_analysis

        results = await asyncio.to_thread(run_analysis, app.state.model, app.state.processor, pil_image, tasks)
    latency_ms = int((time.perf_counter() - started) * 1000)
    return _build_analyze_response(rid, results, latency_ms, settings, settings.mock)


@app.post(
    "/v1/nutrition/lookup",
    response_model=NutritionLookupResponse,
    responses={401: {"description": "invalid API key"}},
)
async def nutrition_lookup(request: NutritionLookupRequest, _auth: bool = Depends(require_auth)):
    settings = get_settings()
    rid = request.request_id or uuid.uuid4().hex
    outcome = await asyncio.to_thread(lookup, request.food_name, request.barcode)
    if outcome.basis is None:
        return NutritionLookupResponse(
            request_id=rid,
            candidate_status="abstained",
            food=None,
            confirmed=None,
            deterministic=True,
            abstention_reason=outcome.reason or "no catalogue or provider match for this food",
            source_refs=[],
            is_mock=settings.mock,
        )
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
    return NutritionLookupResponse(
        request_id=rid,
        candidate_status="candidate",
        food=basis,
        confirmed=confirmed,
        deterministic=True,
        abstention_reason=None,
        source_refs=[ref],
        is_mock=settings.mock,
    )


@app.post(
    "/v1/coach/chat",
    response_model=CoachResponse,
    responses={401: {"description": "invalid API key"}},
)
async def coach_chat(request: CoachRequest, _auth: bool = Depends(require_auth)):
    settings = get_settings()
    rid = request.context.request_id or uuid.uuid4().hex
    refusal = coach_module.policy_refusal(request.messages)
    started = time.perf_counter()
    if refusal:
        response = CoachResponse(
            request_id=rid,
            reply=refusal,
            model_revision=model_revision(settings),
            confidence=1.0,
            refusal=refusal,
            citations=[Citation(type="policy", label="safety", value="medical/safety refusal")],
            proposed_actions=[],
            latency_ms=int((time.perf_counter() - started) * 1000),
            is_mock=settings.mock,
        )
        return response
    messages = coach_module.build_coach_messages(request.context, request.messages)
    messages = coach_module.cap_chat_context(messages, settings.max_chat_chars)
    if sum(len(message.content) for message in messages) > settings.max_chat_chars:
        # irreducible: even grounding + the newest message exceed the cap
        raise _structured_error(
            413,
            "chat_too_large",
            f"chat context exceeds the {settings.max_chat_chars}-char limit",
        )
    if settings.mock:
        actions = coach_module.propose_actions(request.context, request.messages, "")
        reply_text = coach_module.mock_reply(request.messages, actions)
        confidence = 0.9
    else:
        from .model_loader import chat as run_chat

        reply_text, confidence = await asyncio.to_thread(
            run_chat, app.state.model, app.state.processor, messages
        )
        reply_text = coach_module.clean_reply(reply_text)
        actions = coach_module.propose_actions(request.context, request.messages, reply_text)
    citations = []
    if request.context.profile:
        citations.append(Citation(type="profile", label="profile", value="provided profile context"))
    for log in request.context.recent_food_logs[:10]:
        citations.append(Citation(type="food_log", label=log.food_name, value=f"{log.amount_g}g"))
    latency_ms = int((time.perf_counter() - started) * 1000)
    return CoachResponse(
        request_id=rid,
        reply=reply_text,
        model_revision=model_revision(settings),
        confidence=round(float(confidence), 4),
        refusal=None,
        citations=citations,
        proposed_actions=actions,
        latency_ms=latency_ms,
        is_mock=settings.mock,
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
    )