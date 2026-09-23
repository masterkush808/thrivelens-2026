# Food Tracker Model — On-Device Fallback (MobileNetV2/TF.js + TFLite)

This is the **on-device fallback** classifier in ThriveLens — a small 57-class
MobileNetV2 trained on CPU from the ThriveLens SFT manifest's food labels.
It is *not* the primary brain. Food-R1 (Qwen3-VL QLoRA) runs server-side
through `serving/`; the app uses it first (ZeroGPU, then cloud FastAPI) and
drops to this local classifier only when the daily ZeroGPU quota runs out.

## How detection is layered (already wired in the app)

```
ZeroGPU (Food-R1, free, 429/402 on cap)
  └─> on-device TF.js fallback (this model)   source="local"
        └─> cloud FastAPI (/v1/food/analyze)  source="cloud"
```

Implemented in `src/services/inference.ts` + `src/lib/food-recognition.ts`
(`localClassify`, `model_revision = "tfjs/mobilenetv2"`).

## Artifacts bundled with the app

```
assets/ml/
  tfjs/model.json + tfjs/group1-shard*.bin   TF.js Layers model (Expo Go)
  labels.json / labels.txt                   57 classes
  food_model.tflite                         TFLite int8 twin (~2.5 MiB)
```

Metrics (held-out val, leakage-safe split): top-1 ~0.56, top-5 ~0.85.

## Re-training (CPU-only, ~5 min)

```bash
python ml/food_classifier/train.py          # writes assets/ml artifacts
```

The trainer (`train.py`) is the real, runnable one — it:
- loads `train/` `val/` splits (skips corrupt images),
- caches MobileNetV2 160px bottleneck features once (reused across runs),
- trains a class-weighted softmax head with early stopping (best-val restored),
- skips trunk fine-tuning by default (`FINE_EPOCHS=0`) — on a CPU box it
  consistently degraded the frozen-feature baseline (0.55→0.42 val),
- exports h5 + TF.js + TFLite + labels + a per-class metrics report.

Data layout:
```
data/
  train/<Class>/*.jpg     (capped MAX_PER_CLASS, default 250 per class)
  val/<Class>/*.jpg        (full held-out)
```

## Environment (the venv used to train)

`Python 3.11 + TF 2.13.1 + tensorflowjs 3.18` (numpy 1.24). tensorflowjs 3.x
drops numpy aliases, so `train.py` restores `np.object/np.bool/...` before
importing it.

## Why this is free & open source
- Data: ThriveLens SFT manifest food labels (derived from Open Images, CC)
- Training: CPU/local, no GPU, no cloud cost
- Inference: Food-R1 server-side (see `serving/`); local fallback TF.js only
- DB: SQLite + Drizzle (OSS), no paid DB