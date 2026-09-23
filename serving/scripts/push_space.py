"""Upload the ZeroGPU Space files to a Hugging Face Space repo.

Builds a staging tree: space_zero/{README.md,app.py,requirements.txt} plus the
serving app/ package, then pushes to the Space. Auth comes from the saved HF
token (hf auth login) or HF_TOKEN env. Uses a WRITE token.

Usage:
    python scripts/push_space.py --space ntatemasoabi/thrivelens-foodr1
"""
import argparse
import shutil
import sys
import tempfile
from pathlib import Path

from huggingface_hub import HfApi

SERVING_ROOT = Path(__file__).resolve().parents[1]
SPACE_ZERO = SERVING_ROOT / "space_zero"
APP_PACKAGE = SERVING_ROOT / "app"
ADAPTER_KIT = SPACE_ZERO / "adapters" / "thrivelens-foodr1"
SPACE_FILES = ("README.md", "app.py", "requirements.txt")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--space", required=True, help="e.g. <user>/thrivelens-foodr1")
    args = parser.parse_args()

    staging = Path(tempfile.mkdtemp(prefix="thrivelens-space-"))
    try:
        for name in SPACE_FILES:
            src = SPACE_ZERO / name
            if not src.exists():
                sys.exit(f"missing {src}")
            shutil.copy2(src, staging / name)
        if not APP_PACKAGE.exists():
            sys.exit(f"missing app package {APP_PACKAGE}")
        shutil.copytree(APP_PACKAGE, staging / "app")
        if ADAPTER_KIT.exists():
            shutil.copytree(ADAPTER_KIT, staging / "adapters" / "thrivelens-foodr1")
            print("adapter kit included (baked into Space, no private storage/cap)")
        else:
            print("[warn] no adapters/thrivelens-foodr1 — Space will need THRIVELENS_ADAPTER_REPO + HF_TOKEN")
        print(f"staged: {[str(p.relative_to(staging)) for p in staging.rglob('*') if p.is_file()][:6]}...")
        api = HfApi()
        api.upload_folder(
            repo_id=args.space,
            repo_type="space",
            folder_path=str(staging),
            commit_message="Deploy ThriveLens Food-R1 ZeroGPU host (Gradio + serving app)",
            ignore_patterns=["__pycache__/**", "*.pyc", "**/*.pyc"],
        )
        print(f"pushed -> https://huggingface.co/spaces/{args.space}")
        print("next: set hardware + variables (see Space Settings), then it will build")
    finally:
        shutil.rmtree(staging, ignore_errors=True)


if __name__ == "__main__":
    main()