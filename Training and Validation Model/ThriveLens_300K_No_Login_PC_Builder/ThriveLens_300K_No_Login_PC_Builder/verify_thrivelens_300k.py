#!/usr/bin/env python3
"""Validate a locally built ThriveLens 300K Kaggle dataset archive."""

from __future__ import annotations

import hashlib
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path


REQUIRED_FILES = {
    "dataset_manifest.json",
    "README.md",
    "SHA256SUMS.txt",
    "sft/train.jsonl",
    "sft/val.jsonl",
    "sft/test.jsonl",
    "notebooks/ThriveLens_FoodR1_Dual_T4_QLoRA.ipynb",
    "training/patch_zip_loader.py",
    "training/evaluate_foodr1.py",
    "training/qwen-vl-finetune/PINNED_COMMIT.txt",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python verify_thrivelens_300k.py DATASET.zip")

    archive = Path(sys.argv[1]).expanduser().resolve()
    if not archive.is_file():
        raise FileNotFoundError(archive)

    print(f"Validating: {archive}", flush=True)
    with zipfile.ZipFile(archive, "r") as package:
        infos = package.infolist()
        names = [info.filename for info in infos]
        name_set = set(names)
        if len(names) != len(name_set):
            raise RuntimeError("The ZIP contains duplicate entry names.")

        missing = sorted(REQUIRED_FILES - name_set)
        if missing:
            raise RuntimeError(f"Required ZIP entries are missing: {missing}")

        manifest = json.loads(package.read("dataset_manifest.json"))
        if manifest.get("name") != "ThriveLens Open Food 300K + Nutrition5k Food-R1 Kaggle package":
            raise RuntimeError("Unexpected dataset manifest name.")

        split_counts: dict[str, int] = {}
        task_counts: dict[str, Counter[str]] = {}
        split_groups: dict[str, set[str]] = {}
        referenced_images: set[str] = set()

        for split in ("train", "val", "test"):
            count = 0
            tasks: Counter[str] = Counter()
            groups: set[str] = set()
            with package.open(f"sft/{split}.jsonl", "r") as stream:
                for line_number, raw in enumerate(stream, 1):
                    if not raw.strip():
                        continue
                    row = json.loads(raw)
                    count += 1
                    tasks[row["task"]] += 1
                    groups.add(row["group_id"])
                    images = row["image"] if isinstance(row["image"], list) else [row["image"]]
                    for image in images:
                        if not image.startswith("zip://"):
                            raise RuntimeError(
                                f"Invalid image reference in {split}.jsonl line {line_number}: {image}"
                            )
                        referenced_images.add(image.removeprefix("zip://"))
            split_counts[split] = count
            task_counts[split] = tasks
            split_groups[split] = groups

        total_records = sum(split_counts.values())
        if total_records < 300_000:
            raise RuntimeError(f"Expected at least 300,000 supervised records; found {total_records:,}.")
        if split_counts["train"] < 240_000:
            raise RuntimeError(f"Training split is unexpectedly small: {split_counts['train']:,}.")
        if split_counts["val"] < 6_000:
            raise RuntimeError(f"Validation split is unexpectedly small: {split_counts['val']:,}.")
        if split_counts["test"] < 50_000:
            raise RuntimeError(f"Test split is unexpectedly small: {split_counts['test']:,}.")

        overlap = (
            (split_groups["train"] & split_groups["val"])
            | (split_groups["train"] & split_groups["test"])
            | (split_groups["val"] & split_groups["test"])
        )
        if overlap:
            raise RuntimeError(f"Detected {len(overlap):,} source groups crossing dataset splits.")

        missing_images = referenced_images - name_set
        if missing_images:
            examples = sorted(missing_images)[:10]
            raise RuntimeError(
                f"Detected {len(missing_images):,} missing referenced images. Examples: {examples}"
            )

        print(f"Checking CRC for all {len(infos):,} ZIP entries...", flush=True)
        first_bad_entry = package.testzip()
        if first_bad_entry is not None:
            raise RuntimeError(f"ZIP CRC failure: {first_bad_entry}")

    digest = sha256_file(archive)
    result = {
        "status": "READY",
        "archive": str(archive),
        "bytes": archive.stat().st_size,
        "sha256": digest,
        "zip_entries": len(names),
        "supervised_records": total_records,
        "split_counts": split_counts,
        "task_counts": {split: dict(counts) for split, counts in task_counts.items()},
        "unique_referenced_images": len(referenced_images),
        "leakage_safe_groups": sum(len(groups) for groups in split_groups.values()),
    }
    report_path = archive.with_name("ThriveLens_300K_BUILD_VERIFICATION.json")
    report_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
