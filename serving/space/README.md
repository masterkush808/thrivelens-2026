---
title: ThriveLens Food-R1 API
emoji: 🍽️
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
---

# ThriveLens Food-R1 API

Hosted inference for the ThriveLens 2026 food scanner + AI coach.

Sets `sdk: docker` and `app_port: 7860` so the Space wraps the FastAPI
service in `app/` (default uvicorn entrypoint is set in the `Dockerfile`).

## Endpoints

- `POST /v1/food/analyze` — multipart `image` (+ optional `request_id`)
  -> candidates with confidence, model revision, abstention handling.
- `POST /v1/nutrition/lookup` — JSON {food_name, amount_g} -> deterministic
  per-100g catalogue macros (no model inference).
- `POST /v1/coach/chat` — groundable, cited coaching replies + optional
  `log_meal` actions.
- `GET /healthz` — liveness + `model_revision`.

## Environment

All secrets/prefs set in Space -> Settings -> Variables and secrets.

| Name | Required | Purpose |
| --- | --- | --- |
| `HF_TOKEN` | yes | read access to the private ThriveLens adapter repo (and gated base if any) |
| `THRIVELENS_ADAPTER_REPO` | yes | e.g. `<user>/thrivelens-foodr1-adapter`; pulled at startup if not baked into the image |
| `THRIVELENS_SERVING_AUTH` | yes | `token` |
| `THRIVELENS_SERVING_API_KEY` | yes | the key the mobile app sends as `X-API-Key` |
| `THRIVELENS_ADAPTER_SHA256` | optional | adapter weights sha256 (first 16 hex) surfaced in `model_revision` for rollback |

## Hardware

Use a T4 GPU (small or medium). The 8B base is loaded NF4/FP16 so it fits a
16GB T4; prefer **T4 medium (30GB RAM)** because host RAM peak during 4-bit
quantization of the ~16GB bf16 base exceeds a T4 small's 15GB.

See `DEPLOY_HF_SPACE.md` in the parent `serving/` repo for the full step-by-step.