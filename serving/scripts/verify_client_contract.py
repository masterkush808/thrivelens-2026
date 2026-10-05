"""Verify the serving layer returns exactly the shapes omni-fitness-ai parses.

Checks the real FastAPI contract (mock model) against the field names the
client's TypeScript types require, so a wire-format mismatch cannot ship.
"""
import json
import os
import sys

os.environ["THRIVELENS_SERVING_MOCK"] = "1"
os.environ["THRIVELENS_SERVING_AUTH"] = "dev"
os.environ["THRIVELENS_OFF_ENABLED"] = "1"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)
failures = []


def require(obj, keys, label):
    missing = [k for k in keys if k not in obj]
    if missing:
        failures.append(f"{label}: missing {missing}")
    else:
        print(f"  OK  {label}: all {len(keys)} fields present")


print("== /healthz ==")
r = client.get("/healthz")
print(" ", r.status_code, r.json())
require(r.json(), ["status"], "healthz")

print("== /v1/coach/chat (client CoachResult) ==")
coach_req = {
    "context": {
        "request_id": "verify-1",
        "profile": {"height_cm": 180, "weight_kg": 82, "goal": "build muscle"},
        "recent_food_logs": [
            {"food_name": "oats", "amount_g": 80, "meal_type": "breakfast"}
        ],
        "adherence": {
            "active_days_30": 12,
            "target_days_30": 20,
            "logged_workouts_30": 9,
            "streak_days": 4,
            "cheat_day_eligible": False,
        },
    },
    "messages": [
        {"role": "user", "content": "I ate oats for breakfast, what should I eat for dinner?"}
    ],
}
r = client.post("/v1/coach/chat", json=coach_req)
print("  status", r.status_code)
body = r.json()
require(
    body,
    [
        "request_id",
        "reply",
        "model_revision",
        "confidence",
        "refusal",
        "citations",
        "proposed_actions",
        "is_mock",
    ],
    "coach",
)
print("  reply:", str(body.get("reply"))[:100])
print("  proposed_actions:", json.dumps(body.get("proposed_actions"))[:200])
print("  citations:", json.dumps(body.get("citations"))[:160])

print("== /v1/food/analyze (client AnalyzeResult) ==")
import io  # noqa: E402

from PIL import Image  # noqa: E402

buf = io.BytesIO()
Image.new("RGB", (64, 64), (200, 120, 60)).save(buf, format="JPEG")
r = client.post(
    "/v1/food/analyze",
    files={"image": ("meal.jpg", buf.getvalue(), "image/jpeg")},
    params={"request_id": "verify-2"},
)
print("  status", r.status_code)
body = r.json()
require(
    body,
    [
        "request_id",
        "model_revision",
        "candidate_status",
        "candidates",
        "confidence",
        "abstention_reason",
        "is_mock",
    ],
    "analyze",
)
print("  body:", json.dumps(body)[:300])

print("== /v1/nutrition/lookup (client NutritionResult) ==")
r = client.post(
    "/v1/nutrition/lookup",
    json={"request_id": "verify-3", "food_name": "banana", "amount_g": 120, "barcode": None},
)
print("  status", r.status_code)
body = r.json()
require(
    body,
    [
        "request_id",
        "candidate_status",
        "food",
        "confirmed",
        "deterministic",
        "abstention_reason",
        "is_mock",
    ],
    "lookup",
)
print("  body:", json.dumps(body)[:300])

print()
if failures:
    print("CONTRACT FAILURES:")
    for f in failures:
        print("  -", f)
    raise SystemExit(1)
print("ALL CONTRACTS MATCH THE CLIENT TYPES")
