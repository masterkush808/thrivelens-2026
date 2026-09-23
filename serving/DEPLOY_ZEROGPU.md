# Deploy Food-R1 on Hugging Face ZeroGPU (free) + phone fallback

How the free tier works (verified 2026): HF ZeroGPU gives free GPU to **Gradio**
Spaces only. Your phone's photo → `POST /gradio_api/call/analyze` on the Space
→ the adapter runs on the free GPU → JSON candidates come back. When the daily
GPU quota is spent, the app falls back.

Files in `serving/space_zero/` are ready: `app.py` (Gradio + `@spaces.GPU`),
`requirements.txt`, `README.md` (metadata).

---

## Step 1 — Space prerequisites

- HF account in **good standing**: email verified AND account older than
  **30 days** (free personal accounts can host up to 2 ZeroGPU Spaces).
- Access token with **read** scope (Settings -> Access Tokens).

## Step 2 — Push the adapter (still private)

Run from `serving/` (uses `scripts/push_adapter.py`):

    $env:HF_TOKEN="hf_..."
    python scripts/push_adapter.py --adapter "C:\Users\thaba\AppData\Local\Temp\opencode\foodr1_final\adapter_and_reports" --repo <user>/thrivelens-foodr1-adapter

Copy the two printed env values (`THRIVELENS_ADAPTER_REPO`, `THRIVELENS_ADAPTER_SHA256`).

## Step 3 — Create the Space

1. https://huggingface.co/new-space
2. Name: `thrivelens-foodr1-zerogpu`  ·  SDK: **Gradio**  ·  Visibility: **Public**.
3. Create.
4. **Settings -> Hardware**: choose **ZeroGPU** (`zero-a10g`).
5. **Settings -> Variables and secrets**:
   - Secret `HF_TOKEN` = your read token (lets the Space open your private adapter repo).
   - Variable `THRIVELENS_ADAPTER_REPO` = `<user>/thrivelens-foodr1-adapter`
   - Variable `THRIVELENS_USE_4BIT` = `0` (ZeroGPU has big VRAM; load the 8B in bf16 — no bitsandbytes, higher accuracy)
   - Variable `THRIVELENS_MODEL_DTYPE` = `bf16`
   - Variable `THRIVELENS_ADAPTER_SHA256` = sha from step 2

## Step 4 — Upload app files

Upload into the Space repo: `space_zero/app.py`, `space_zero/requirements.txt`,
`space_zero/README.md` **plus the whole `serving/app/` folder** (the Gradio app
imports `app.model_loader`, `app.config`, etc.).

`requirements.txt` deliberately omits `gradio`, `spaces`, `huggingface_hub`
(preinstalled by ZeroGPU), pins `torch==2.10.0` (in ZeroGPU's supported list),
and skips `bitsandbytes` (not needed in bf16 mode).

First start downloads the ~16GB base + adapter → give it minutes. The Space then
runs on the free GPU per request. First call still pays a cold-ish latency.

## Step 5 — Test from a browser/curl

Space URL: `https://<user>-thrivelens-foodr1-zerogpu.hf.space`

- Open the page (the Anthropic-free Gradio UI): upload a photo, click **Analyze**,
  read the JSON.
- The phone uses the exact same endpoints:
  - `POST /gradio_api/upload` (multipart `files`) -> `{path}`
  - `POST /gradio_api/call/analyze`  body `{"data":[{"path":"...","meta":{"_type":"gradio.FileData"}}]}`
  - `GET  /gradio_api/call/analyze/<event_id>` -> poll, read `data[0]` JSON.

This protocol is already implemented in `omni-fitness-ai/src/services/inference.ts`
(`analyzeImageZeroGPU`) and driven from `food-recognition.ts`.

## Step 6 — Wire the app

`omni-fitness-ai/.env`:

    EXPO_PUBLIC_ZEROGPU_URL=https://<user>-thrivelens-foodr1-zerogpu.hf.space
    EXPO_PUBLIC_HF_TOKEN=hf_...            # so quota hits YOUR account, not anonymous
    EXPO_PUBLIC_INFERENCE_URL=http://127.0.0.1:8000   # cloud-fallback (FastAPI/mock)

Detection chain (already coded): **ZeroGPU first** → on 429/402 (quota/day-cap)
→ on-device classifier → else cloud FastAPI. Unknown foods that fail to parse also
abstain gracefully.

## Step 7 — The on-device fallback (DONE)

The on-device fallback classifier is built, trained, and bundled. It is a
MobileNetV2 (160px) export trained from the ThriveLens SFT manifest's food
labels (57 classes) by `ml/food_classifier/train.py` (feature-cached, runs on
a plain 8 GiB CPU box in ~3 min once cached).

Held-out metrics (val, leakage-safe group split):
- top-1 accuracy ~0.56, **top-5 accuracy ~0.85**
- 57 classes, predictions spread across all classes (no majority collapse)

Artifacts live in `omni-fitness-ai/assets/ml/`:
- `tfjs/model.json` + `tfjs/group1-shard*.bin` — TF.js Layers model used by the app
- `labels.json` / `labels.txt` — class index ↔ label
- `food_model.tflite` — TFLite int8 twin (for future dev-build runtimes)

Runtime: TF.js (`@tensorflow/tfjs` + `@tensorflow/tfjs-react-native`, Expo-Go
compatible, WebGL→CPU fallback backend). The `localClassify` stub in
`src/lib/food-recognition.ts` is filled: resize 160 → normalize → softmax →
top-5 candidates with confidence, `model_revision = "tfjs/mobilenetv2"`,
`source = "local"`. Assets are declared in `app.json` `assetBundlePatterns`.

Caveat: fine-tuning the MobileNet trunk on a CPU box consistently *degraded*
val accuracy, so the shipped model keeps the trunk frozen and trains the
classification head only. Re-export after any re-train:

    python ml/food_classifier/train.py   # writes assets/ml artifacts

If the bundle is stripped or the runtime is missing, the fallback surfaces a
clear "not available on this build" error instead of silently faking results —
the app never lies about which brain produced an answer.

## Quota math (free account)

~5 GPU-min/day; each analyze ≈ 10–30s of GPU → roughly 10–30 scans/day, plus an
unofficial ~3–5 "Space runs"/day cap reported for free tiers. `429`/`402` responses
are exactly what `isQuotaCap()` watches for. Setting `EXPO_PUBLIC_HF_TOKEN` moves
you from the anonymous 2-min tier to the account 5-min tier.