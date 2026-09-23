#!/usr/bin/env python3
"""GPU smoke for the ThriveLens Food-R1 serving stack.

Loads the base model + adapter exactly like the service does, runs one
classify + ingredient pass on a generated test image, and prints the serving
contract with measured latency and confidence. Requires a GPU machine.

Usage:
    python -m scripts.smoke_gpu_inference --adapter <adapter_dir> [--image path.png]
"""

import argparse
import sys
import time
import uuid

from PIL import Image

from app import model_loader, parsers


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="zy12123/Food-R1")
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--image", default=None, help="path to a test food image")
    args = parser.parse_args()

    image = (
        Image.open(args.image) if args.image else Image.new("RGB", (512, 512), (200, 140, 90))
    )
    model, processor = model_loader.load_model(args.model, args.adapter)
    revision = f"{args.model}@{model_loader.adapter_sha256(args.adapter)}"
    started = time.perf_counter()
    results = model_loader.analyze_food(
        model, processor, image, ["food_classification", "ingredient_recognition"]
    )
    latency_ms = int((time.perf_counter() - started) * 1000)
    print(f"model_revision: {revision}")
    print(f"latency_ms: {latency_ms}")
    for result in results:
        print(
            f"{result['task']}: answer={result['answer']!r} "
            f"confidence={result['confidence']} valid={result['valid']}"
        )
        print(f"  raw: {result['raw'][:200]}")
    if not any(r["valid"] for r in results):
        print("WARNING: no valid answer block parsed; raise abstention review")
        sys.exit(2)


if __name__ == "__main__":
    main()