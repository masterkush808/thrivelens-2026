"""Push the trained ThriveLens Food-R1 QLoRA adapter to a Hugging Face repo.

Uploads ONLY what peft needs to load the adapter (free private storage is
small ~a few hundred MB); reports/checkpoints stay local unless --include-reports.

Usage:
    python scripts/push_adapter.py ^
        --adapter ../../adapter_and_reports ^
        --repo <your-user>/thrivelens-foodr1-adapter [--include-reports]

Defaults to a PRIVATE repo (the mobile-serving weights should not be public).
Uses HF_TOKEN from the environment or --token (fine-grained token with
"write" access to the repo / account).

After a successful push it prints the env block to set on the Space.
"""
import argparse
import hashlib
import os
import shutil
import sys
import tempfile

from huggingface_hub import HfApi

REQUIRED_FILES = (
    "adapter_config.json",
    "adapter_model.safetensors",
    "chat_template.jinja",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
)
REQUIRED_FILES = tuple(f for f in REQUIRED_FILES if f)  # keep all; missing ones skipped with warning


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", required=True, help="local dir with adapter_config.json + adapter_model.safetensors")
    parser.add_argument("--repo", required=True, help="e.g. <user>/thrivelens-foodr1-adapter")
    parser.add_argument("--public", action="store_true", help="make the repo public (default: private)")
    parser.add_argument("--include-reports", action="store_true", help="also upload logs/reports/runs (big; may exceed free private storage)")
    parser.add_argument("--token", default=os.getenv("HF_TOKEN", ""), help="HF token; falls back to env HF_TOKEN")
    args = parser.parse_args()

    adapter = os.path.abspath(args.adapter)
    weights = os.path.join(adapter, "adapter_model.safetensors")
    config = os.path.join(adapter, "adapter_config.json")
    for path, label in ((weights, "adapter_model.safetensors"), (config, "adapter_config.json")):
        if not os.path.exists(path):
            sys.exit(f"missing {label}: {path}")

    token = args.token or os.getenv("HF_TOKEN", "")
    if not token:
        sys.exit("no HF token: pass --token or set HF_TOKEN")

    digest = hashlib.sha256()
    with open(weights, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    sha16 = digest.hexdigest()[:16]

    staging = tempfile.mkdtemp(prefix="thrivelens-adapter-")
    try:
        sources = list(REQUIRED_FILES) if not args.include_reports else os.listdir(adapter)
        copied = []
        for name in sources:
            src = os.path.join(adapter, name)
            if os.path.isfile(src):
                shutil.copy2(src, os.path.join(staging, name))
                copied.append(name)
            elif args.include_reports and os.path.isdir(src) and name != "runs":
                shutil.copytree(src, os.path.join(staging, name))
                copied.append(name)
        for name in REQUIRED_FILES:
            if name not in copied:
                print(f"[warn] optional file missing (skipped): {name}")
        print(f"uploading {len(copied)} files: {copied}")

        api = HfApi(token=token)
        api.create_repo(repo_id=args.repo, repo_type="model", private=not args.public, exist_ok=True)
        api.upload_folder(repo_id=args.repo, folder_path=staging, repo_type="model")
        print(f"uploaded -> https://huggingface.co/{args.repo}")
        print(f"adapter sha256 (first 16 hex): {sha16}")
        print()
        print("Space env block:")
        print(f"  THRIVELENS_ADAPTER_REPO={args.repo}")
        print(f"  THRIVELENS_ADAPTER_SHA256={sha16}")
    finally:
        shutil.rmtree(staging, ignore_errors=True)


if __name__ == "__main__":
    main()