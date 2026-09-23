---
title: ThriveLens Food-R1 (ZeroGPU)
emoji: 🍽️
colorFrom: green
colorTo: gray
sdk: gradio
app_file: app.py
python_version: "3.12"
short_description: Open-vocab food recognition on free GPU
pinned: false
license: apache-2.0
startup_duration_timeout: 1h
---

# ThriveLens Food-R1 (ZeroGPU)

The trained Food-R1 adapter served on Hugging Face's **free** ZeroGPU hardware.
Gradio SDK (ZeroGPU is Gradio-only), Python 3.12, `import spaces` before torch.

## Layout

- `app.py` — Gradio app; `@spaces.GPU` runs the two trained tasks
  (`food_classification`, `ingredient_recognition`) with confidence + abstention.
- `app/` — the shared ThriveLens serving package (model loader, parsers, catalog).
- `adapters/thrivelens-foodr1/` — the trained LoRA adapter, **baked into the
  repo** (free public storage; no private-repo cap, no `HF_TOKEN` needed for it).
- `requirements.txt` — torch 2.10 (ZeroGPU-supported), transformers 5.3.0, peft,
  accelerate, safetensors, timm, numpy, Pillow. `gradio`/`spaces`/`huggingface_hub`
  are preinstalled by ZeroGPU and must NOT be pinned.

## Variables (Settings -> Variables and secrets)

| Name | Value |
| --- | --- |
| `THRIVELENS_ADAPTER_DIR` | `adapters/thrivelens-foodr1` (relative to repo root) |
| `THRIVELENS_USE_4BIT` | `0` (bf16 — ZeroGPU VRAM is large, no bitsandbytes) |
| `THRIVELENS_MODEL_DTYPE` | `bf16` |
| `HF_TOKEN` | optional — only if the base model ever gates access |

Hardware: **ZeroGPU** (requires a public Space + account aged > 30 days).

## API

Phone app talks to `POST /gradio_api/call/analyze` (multipart upload -> call ->
poll). Returns `{candidate_status, candidates[], confidence, model_revision, is_mock}`.
Daily free quota is ~5 GPU-min — the app falls back to the on-device classifier
on 429/402.