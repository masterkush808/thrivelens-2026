# Model Card — ThriveLens Food-R1 (QLoRA adapter for `zy12123/Food-R1`)

This card covers the delivered adapter inside
`ThriveLens_FoodR1_Dual_T4_QLoRA_Final.zip` (`adapter_and_reports/`).

## Summary

- **Base model:** `zy12123/Food-R1` (Qwen3-VL, `Qwen3VLForConditionalGeneration`).
- **Method:** supervised fine-tuning with **4-bit NF4 QLoRA** (double
  quantization, FP16 compute), DeepSpeed ZeRO-2, DDP across **2x NVIDIA T4**.
- **Adapter rank:** `r=16, alpha=16, dropout=0.05`, all-linear
  (`q/k/v/o/gate/up/down`), **excluding** `lm_head`, `embed_tokens`, and
  `visual` spans; vision tower and merger frozen.
- **Delivery:** `adapter_model.safetensors`, `adapter_config.json`,
  `chat_template.jinja`, `tokenizer.json`, eval reports, run manifest,
  `full_training.log`, `benchmark_timing.json`.

## Training provenance

| Field | Value |
|---|---|
| Dataset records | 302,157 (train 242,756 / val 6,460 / test 52,941) |
| Dataset sources | Open Images food crops 107,794 · Fruits-360 183,893 · Nutrition5k 3,490 |
| Archive | `ThriveLens_OpenFood_FoodR1_Kaggle_300K.zip` |
| Manifest version | 2.0.0 (archive hash: `not-applicable-kaggle-extracted-mode`) |
| Epochs / global steps | 1.0 / 1,535 |
| Effective batch | 16 (micro 1 × 8 accum × 2 GPUs) |
| Optimizer / schedule | paged AdamW 8-bit · LR 2e-4 · cosine · warmup 5% · wd 0.01 · grad-norm 0.3 |
| Sequence / image | max 192 tokens · pixels 4096–25600 (256²–768²) |
| Seed | 2026 (full determinism off, per run contract) |
| Software | Python 3.12.13 · torch 2.10.0+cu128 · transformers 5.3.0 · accelerate 1.13.0 · peft 0.15.2 · bitsandbytes 0.49.2 · deepspeed 0.17.5 · trl 0.25.0 |
| Started / completed (UTC) | 2026-09-15 → 2026-09-15T13:44:46Z |
| Heterogeneous notes | One fixed epoch; no early stopping; step checkpoints every 250; resume contract in notebook |

## Evaluation (held-out, deterministic greedy)

Full 400/400 test subset in the delivery: **0% failures, 99.25% answer-tag
compliance, overall exact match 79.25%, token F1 86.63%, valid JSON 80% on
structured tasks.** Generation ~10.25 tokens/s (5,787 tokens, ~1,039 s).

| Task | Samples | EM | F1 | Notes |
|---|---|---|---|---|
| produce_variety_classification | 344 | 82.85% | 89.21% | Fruits-360 variety labels |
| food_classification | 41 | 75.61% | 75.61% | Open Images crop labels |
| ingredient_recognition | 3 | 33.33% | 81.33% | set F1 0.52 |
| nutrition_estimation | 6 | 0% | 63.33% | mass/calorie/calorie MAPE high |
| full_food_analysis | 6 | 0% | 40.04% | ingredient F1 0.24; MAPE large |

Small-sample tasks (`ingredient_recognition`, `nutrition_estimation`,
`full_food_analysis`) should be read as diagnostic, not production evidence.

## Intended use

- **Food recognition (observation layer)** of the ThriveLens mobile pipeline:
  a photo → candidate food name + confidence, with **abstention** below a
  threshold. Nutrition values are **never** taken from the model; they are
  recomputed deterministically from a catalogue after user confirmation.
- **Grounded coach**: shared food-analysis questions using supplied user
  context, with citations, refusals, and validated typed actions requiring
  explicit approval.

## Out of scope

- Estimating an exact portion mass or hidden ingredients from a single photo
  (Blueprint "non-claims": a photo does not establish exact portion mass or
  hidden ingredients).
- `nutrition_estimation` / `full_food_analysis` on plain camera photos — the
  training contract expects **RGB + depth-map pairs** (Nutrition5k), which a
  phone camera cannot provide.
- Medical, diagnostic, or prescriptive outputs — service-level refusal policy.
- On-device deployment: weights exceed the device budget; inference is
  server-side only.

## Known limitations

- Confidence is the mean top-token softmax across generated tokens; it is **not
  calibrated** to empirical accuracy. The 0.45 abstain threshold in serving is
  provisional and must be re-measured on the real serving split before release.
- `ingredient_recognition` was trained on overhead plated-meal shots; real
  handheld photos are out-of-distribution.
- Produce variety classes are Fruits-360 names (e.g. "Apple 22"); the serving
  pipeline uses `food_classification` as the primary signal.
- Numeric nutrition outputs display high MAPE on the small Nutrition5k tasks.
- Model fashions a plausible answer even on images without food (abstention is
  confidence-gated, not kind-aware).

## Privacy & safety

- Serving decodes images in memory and discards them; logs are redacted.
- No "hallucination impossible" claim is made (Blueprint §14.3).
- Nutrition output is informational and labelled "estimated"; the UI requests
  correction and escalates medical concerns.

## Reproducibility

Run manifest, full training log, evaluator, held-out metrics, representative
predictions, `benchmark_timing.json`, and GPU smoke results ships in the
delivery zip. Serve via `serving/` with the same loader path as the evaluator.