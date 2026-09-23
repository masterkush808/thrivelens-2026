#!/usr/bin/env python3
"""Distributed held-out evaluation for the ThriveLens Food-R1 adapter."""

import argparse
import io
import json
import os
import re
import zipfile
from collections import defaultdict

import torch
import torch.distributed as dist
from PIL import Image
from peft import PeftModel
from transformers import AutoProcessor, BitsAndBytesConfig, Qwen3VLForConditionalGeneration


def normalize(text):
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def answer_block(text):
    match = re.search(r"<answer>(.*?)</answer>", text, flags=re.I | re.S)
    return (match.group(1) if match else text).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--test-json", required=True)
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--model", default="zy12123/Food-R1")
    parser.add_argument("--max-samples", type=int, default=0,
                        help="0 evaluates the entire held-out test split")
    parser.add_argument("--output", default="/kaggle/working/foodr1_test_metrics.json")
    args = parser.parse_args()

    dist.init_process_group("nccl")
    rank = dist.get_rank()
    world = dist.get_world_size()
    torch.cuda.set_device(rank)

    with open(args.test_json, encoding="utf-8") as handle:
        rows = json.load(handle)
    if args.max_samples > 0:
        rows = rows[: args.max_samples]
    rows = rows[rank::world]

    quant = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.float16,
    )
    model = Qwen3VLForConditionalGeneration.from_pretrained(
        args.model,
        torch_dtype=torch.float16,
        quantization_config=quant,
        device_map={"": rank},
        attn_implementation="sdpa",
        trust_remote_code=True,
    )
    model = PeftModel.from_pretrained(model, args.adapter).eval()
    processor = AutoProcessor.from_pretrained(args.model, trust_remote_code=True)
    archive = zipfile.ZipFile(args.archive, "r")

    local = defaultdict(float)
    predictions = []
    for index, row in enumerate(rows):
        paths = row["image"] if isinstance(row["image"], list) else [row["image"]]
        images = []
        for path in paths:
            member = path[len("zip://"):] if path.startswith("zip://") else path
            with Image.open(io.BytesIO(archive.read(member))) as image:
                images.append(image.convert("RGB").copy())
        prompt = row["conversations"][0]["value"].replace("<image>\n", "").replace("<image>", "")
        messages = [{"role": "user", "content": [
            *[{"type": "image", "image": image} for image in images],
            {"type": "text", "text": prompt},
        ]}]
        batch = processor.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=True,
            return_dict=True, return_tensors="pt",
        ).to(rank)
        with torch.inference_mode():
            generated = model.generate(**batch, max_new_tokens=192, do_sample=False)
        generated = generated[:, batch.input_ids.shape[1]:]
        pred = processor.batch_decode(generated, skip_special_tokens=True)[0]
        ref = row["conversations"][1]["value"]
        pred_answer, ref_answer = answer_block(pred), answer_block(ref)
        exact = float(normalize(pred_answer) == normalize(ref_answer))
        contains = float(normalize(ref_answer) in normalize(pred_answer))
        local["count"] += 1
        local["exact"] += exact
        local["contains"] += contains
        task = row.get("task", "unknown")
        local[f"count::{task}"] += 1
        local[f"exact::{task}"] += exact
        if len(predictions) < 100:
            predictions.append({"id": row["id"], "task": task, "prediction": pred, "reference": ref})
        if rank == 0 and (index + 1) % 100 == 0:
            print(f"rank 0 evaluated {index + 1}/{len(rows)}")

    gathered = [None for _ in range(world)]
    dist.all_gather_object(gathered, {"scores": dict(local), "examples": predictions})
    if rank == 0:
        total = defaultdict(float)
        examples = []
        for shard in gathered:
            for key, value in shard["scores"].items():
                total[key] += value
            examples.extend(shard["examples"])
        report = {
            "samples": int(total["count"]),
            "exact_match": total["exact"] / max(total["count"], 1),
            "contains_match": total["contains"] / max(total["count"], 1),
            "by_task": {},
            "sample_predictions": examples[:200],
        }
        for key in sorted(total):
            if key.startswith("count::"):
                task = key.split("::", 1)[1]
                count = total[key]
                report["by_task"][task] = {
                    "samples": int(count),
                    "exact_match": total[f"exact::{task}"] / max(count, 1),
                }
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2, ensure_ascii=False)
        print(json.dumps({k: v for k, v in report.items() if k != "sample_predictions"}, indent=2))
    dist.barrier()
    dist.destroy_process_group()


if __name__ == "__main__":
    main()
