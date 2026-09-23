import hashlib
import os
from typing import Optional

import torch  # pyright: ignore[reportMissingImports]  # runtime dep (GPU host / ZeroGPU)
import torch.nn.functional as F  # pyright: ignore[reportMissingImports]
from huggingface_hub import snapshot_download
from peft import PeftModel  # pyright: ignore[reportMissingImports]
from PIL import Image
from transformers import AutoProcessor, BitsAndBytesConfig, Qwen3VLForConditionalGeneration  # pyright: ignore[reportMissingImports]

from . import parsers
from .config import get_settings


def adapter_sha256(adapter_dir: str) -> str:
    path = os.path.join(adapter_dir, "adapter_model.safetensors")
    if not os.path.exists(path):
        return "adapter-not-found"
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()[:16]


def _ensure_adapter(adapter_dir: str) -> None:
    settings = get_settings()
    marker = os.path.join(adapter_dir, "adapter_model.safetensors")
    if os.path.exists(marker):
        return
    if not settings.adapter_repo:
        raise RuntimeError(
            f"adapter missing at {adapter_dir!r} and THRIVELENS_ADAPTER_REPO is "
            "empty; point THRIVELENS_ADAPTER_DIR at an existing adapter or set "
            "THRIVELENS_ADAPTER_REPO so it can be pulled from the Hub"
        )
    try:
        snapshot_download(
            repo_id=settings.adapter_repo,
            token=settings.hf_token or None,
            local_dir=adapter_dir,
        )
    except Exception as exc:
        raise RuntimeError(f"failed to pull adapter from {settings.adapter_repo}: {exc}") from exc
    if not os.path.exists(marker):
        raise RuntimeError(
            f"adapter repo pulled from {settings.adapter_repo} but "
            f"{marker!r} is still missing; adapter layout is unexpected"
        )


def load_model(base_model: str, adapter_dir: str, device: int = 0):
    settings = get_settings()
    _ensure_adapter(adapter_dir)
    if not torch.cuda.is_available():
        raise RuntimeError(
            "real serving requires CUDA but torch.cuda.is_available() is False; "
            "run in mock mode (THRIVELENS_SERVING_MOCK=1) on machines without a GPU"
        )
    if device >= torch.cuda.device_count():
        raise RuntimeError(
            f"requested device {device} but only {torch.cuda.device_count()} CUDA device(s) available"
        )
    token = settings.hf_token or None
    torch_dtype = torch.bfloat16 if settings.model_dtype == "bf16" else torch.float16
    kwargs: dict = {
        "torch_dtype": torch_dtype,
        "device_map": {"": device},
        "attn_implementation": "sdpa",
        "trust_remote_code": True,
        "token": token,
    }
    if settings.use_4bit:
        quantization = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.float16,
        )
        kwargs["quantization_config"] = quantization
    model = Qwen3VLForConditionalGeneration.from_pretrained(base_model, **kwargs)
    model = PeftModel.from_pretrained(model, adapter_dir)
    model.eval()
    processor = AutoProcessor.from_pretrained(base_model, trust_remote_code=True, token=token)
    try:
        processor.image_processor.min_pixels = settings.image_min_pixels
        processor.image_processor.max_pixels = settings.image_max_pixels
    except Exception:
        pass
    return model, processor


def _generate(model, processor, messages, max_new_tokens: int):
    batch = processor.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        return_dict=True,
        return_tensors="pt",
    ).to(model.device)
    with torch.inference_mode():
        output = model.generate(
            **batch,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            return_dict_in_generate=True,
            output_scores=True,
        )
    generated = output.sequences[:, batch.input_ids.shape[1]:]
    text = processor.batch_decode(generated, skip_special_tokens=True)[0]
    scores = [F.softmax(step, dim=-1).max(dim=-1).values.item() for step in output.scores]
    confidence = round(sum(scores) / len(scores), 4) if scores else 0.0
    return text, confidence


def _messages_with_image(image: Image.Image, prompt: str):
    copied = image.convert("RGB").copy()
    return [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": copied},
                {"type": "text", "text": prompt},
            ],
        }
    ]


def analyze_food(model, processor, image: Image.Image, tasks, max_new_tokens: Optional[int] = None):
    settings = get_settings()
    limit = max_new_tokens or settings.max_new_tokens
    results = []
    for task in tasks:
        prompt = _prompt_for(task)
        messages = _messages_with_image(image, prompt)
        text, confidence = _generate(model, processor, messages, limit)
        parsed = parsers.extract(task, text)
        results.append(
            {
                "task": task,
                "raw": text[:2000],
                "answer": parsed.answer,
                "confidence": confidence,
                "valid": parsed.valid,
            }
        )
    return results


def chat(model, processor, messages, max_new_tokens: Optional[int] = None):
    settings = get_settings()
    limit = max_new_tokens or settings.coach_max_new_tokens
    payload = [
        {
            "role": message.role,
            "content": [{"type": "text", "text": message.content}],
        }
        for message in messages
    ]
    text, confidence = _generate(model, processor, payload, limit)
    return text, confidence


def _prompt_for(task: str) -> str:
    from . import prompts

    return prompts.build(task, image_count=1)