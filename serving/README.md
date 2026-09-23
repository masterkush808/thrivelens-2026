# ThriveLens Food-R1 Serving

Server-side inference service for the trained **ThriveLens Food-R1** adapter
(`zy12123/Food-R1` + `peft` QLoRA adapter, run from
`ThriveLens_FoodR1_Dual_T4_QLoRA_Final.zip`). This is the **only** place the
model runs. The Expo app never loads model weights and never holds a private
inference token (see the Research Blueprint section. 7.6 / 8.1 / 9.1).

## Pipeline contract

Blueprints the app consumes (`blueprint_food_analysis.md` is the audit source):

- `POST /v1/food/analyze` — upload one photo → Food-R1 returns **candidates**
  (observation only, not a meal log), confidence, `candidate_status`,
  `confidence_or_abstention`, `model_revision`, `request_id`, `source_refs`.
- `POST /v1/nutrition/lookup` — confirmed food + portion → **deterministic**
  macros from a catalogue (per-100 g basis), never the model's numbers.
- `POST /v1/coach/chat` — grounded coach: typed reply, citations to provided
  context, optional validated `log_meal` action that requires user approval.

Recognition is an observation; the confirmed log is a user decision backed by a
nutrition source. Nothing about nutrition is written to a log by the model.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/healthz` | none | readiness + revision |
| POST | `/v1/food/analyze` | API key | candidate recognition + confidence/abstention |
| POST | `/v1/nutrition/lookup` | API key | deterministic catalogue arithmetic |
| POST | `/v1/coach/chat` | API key | grounded coach reply + validated actions |

## Security

- Secrets live **server-side**. Local copies of the adapter are private.
- `THRIVELENS_SERVING_AUTH=dev` binds to `127.0.0.1` for local work with no key.
- `THRIVELENS_SERVING_AUTH=token` requires `X-API-Key` matching
  `THRIVELENS_SERVING_API_KEY` (server env). In the app, the key is read from
  `EXPO_PUBLIC_INFERENCE_TOKEN` **in development only**; before any release the
  app must call an authenticated gateway (Supabase/Edge) that holds the key and
  forwards to this service. Do not ship an Expo bundle with a live token.
- Images are decoded in memory and discarded. Logs contain request IDs and
  status, never images or personal data.
- `EXPO_PUBLIC_HF_TOKEN` is **legacy and removed**; public Expo vars are visible
  in the bundle and are not a secret boundary (Blueprint §9.1, §14.1).

## Run modes

### Mock (no GPU, for app + test development)

```bash
python -m venv .venv && .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
$env:THRIVELENS_SERVING_MOCK="1"
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Mock responses are flagged `"is_mock": true` so tests never masquerade as real
inference. Responses carry the same shape/idempotent contract.

### Real (GPU box, e.g. another Kaggle T4 window or a CUDA Linux host)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-real.txt
# place the adapter at models/thrivelens-foodr1-adapter/ OR point env var
$env:THRIVELENS_ADAPTER_DIR="/path/to/adapter_and_reports"
unset THRIVELENS_SERVING_MOCK
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The loader mirrors the held-out evaluator byte-for-byte:
`bitsandbytes` NF4 + double quantization + FP16 compute, `device_map={"":0}`,
`attn_implementation="sdpa"`, PEFT load, greedy `do_sample=False`,
`max_new_tokens=192`, the same `apply_chat_template` + trained task prompts, and
training-contract image pixel limits. Confidence is the mean top-token
softmax across generated tokens — a real measurement, not a UI claim.

## Tests

```bash
$env:THRIVELENS_SERVING_MOCK="1"
python -m pytest tests -q
```

Covers the serving contract: candidate/abstention shape, deterministic
nutrition math, abstention on unknown food, medical refusal, citations, auth
gates (including `token` mode). GPU smoke:
`python -m scripts.smoke_gpu_inference --adapter <adapter_dir>`.

## Model card

Full provenance, eval results, and limitations: see `MODEL_CARD.md`.

## Rollback

Adapter SHA-256 is attached to every response (`model_revision`). Keep the
previous adapter directory and point `THRIVELENS_ADAPTER_DIR` back to it; no
code change needed. The dataset manifest with hashes is in the delivery zip.