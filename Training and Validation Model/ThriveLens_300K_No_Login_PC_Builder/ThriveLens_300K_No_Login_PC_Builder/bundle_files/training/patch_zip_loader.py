#!/usr/bin/env python3
"""Patch the pinned Qwen-VL finetuner to read images directly from this ZIP.

This keeps the multi-gigabyte dataset on Kaggle's read-only input mount instead
of extracting it into the limited working disk. Each DataLoader worker owns one
ZipFile handle and returns a fully detached RGB PIL image.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parent / "qwen-vl-finetune"
DATA_UTILS = ROOT / "src" / "dataset" / "data_utils.py"
SFT_DATASET = ROOT / "src" / "dataset" / "sft_dataset.py"


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        print(f"Already patched: {path}")
        return
    if old not in text:
        raise RuntimeError(f"Expected source block was not found in {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"Patched: {path}")


replace_once(
    DATA_UTILS,
    "import re\nimport torch\nfrom functools import lru_cache\n",
    "import io\nimport os\nimport re\nimport zipfile\nimport torch\n"
    "from functools import lru_cache\nfrom PIL import Image\n",
)

replace_once(
    DATA_UTILS,
    "def get_image_info(image_path, min_pixel, max_pixel, width, height, image_patch_size):\n"
    "    # Using this because of process_vision_info function\n",
    "@lru_cache(maxsize=8)\n"
    "def _zip_handle(archive_path):\n"
    "    return zipfile.ZipFile(archive_path, 'r')\n\n"
    "def _resolve_zip_image(image_path):\n"
    "    if not isinstance(image_path, str) or not image_path.startswith('zip://'):\n"
    "        return image_path\n"
    "    archive_path = os.environ.get('THRIVELENS_ARCHIVE')\n"
    "    if not archive_path:\n"
    "        raise RuntimeError('THRIVELENS_ARCHIVE must point to the ThriveLens ZIP')\n"
    "    member = image_path[len('zip://'):].lstrip('/')\n"
    "    raw = _zip_handle(archive_path).read(member)\n"
    "    with Image.open(io.BytesIO(raw)) as image:\n"
    "        return image.convert('RGB').copy()\n\n"
    "def get_image_info(image_path, min_pixel, max_pixel, width, height, image_patch_size):\n"
    "    image_path = _resolve_zip_image(image_path)\n"
    "    # Using this because of process_vision_info function\n",
)

replace_once(
    SFT_DATASET,
    "                    if not image_file.startswith(\"http\"):\n"
    "                        image_file = os.path.join(image_folder, image_file)\n",
    "                    if not image_file.startswith((\"http\", \"zip://\")):\n"
    "                        image_file = os.path.join(image_folder, image_file)\n",
)

print("ZIP streaming support is ready.")
