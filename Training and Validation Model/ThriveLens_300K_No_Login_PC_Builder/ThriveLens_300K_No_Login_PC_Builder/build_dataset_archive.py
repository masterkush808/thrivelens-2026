#!/usr/bin/env python3
"""Build the real-image ThriveLens Food-R1 Kaggle package from open sources."""

from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import os
import random
import re
import shutil
import threading
import time
import zipfile
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from PIL import Image, ImageOps
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


OUT = Path(
    os.environ.get(
        "THRIVELENS_OUTPUT",
        "/dev/shm/ThriveLens_OpenFood_FoodR1_Kaggle_300K.zip",
    )
).expanduser().resolve()
ROOT = Path(__file__).resolve().parent
FRUITS_ARCHIVE = Path(
    os.environ.get(
        "THRIVELENS_FRUITS_ARCHIVE",
        "/dev/shm/fruits-360-100x100-main.zip",
    )
).expanduser().resolve()
NUTRITION_BUCKET = "nutrition5k_dataset"
NUTRITION_PREFIX = "nutrition5k_dataset/"
NUTRITION_API = f"https://storage.googleapis.com/storage/v1/b/{NUTRITION_BUCKET}/o"
OPENIMAGES_BOXES = "https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-bbox.csv"
OPENIMAGES_CLASSES = "https://storage.googleapis.com/openimages/v5/class-descriptions-boxable.csv"
OPENIMAGES_METADATA = "https://storage.googleapis.com/openimages/2018_04/train/train-images-boxable-with-rotation.csv"
OPENIMAGES_IMAGE = "https://open-images-dataset.s3.amazonaws.com/train/{image_id}.jpg"
# Consume the complete valid pool instead of imposing the earlier 400/class cap.
OPENIMAGES_PER_CLASS = 100_000
MAX_WORKERS = 28
SEED = 2026


# Food/drink classes among the official boxable Open Images classes. These are
# intentionally broad and worldwide; tools/containers and animal homonyms are excluded.
FOOD_CLASSES = {
    "/m/014j1m": "Apple", "/m/015wgc": "Croissant", "/m/015x4r": "Cucumber",
    "/m/01b9xk": "Hot dog", "/m/01dwsz": "Waffle", "/m/01dwwc": "Pancake",
    "/m/01f91_": "Pretzel", "/m/01hrv5": "Popcorn", "/m/01j3zr": "Burrito",
    "/m/01nkt": "Cheese", "/m/01tcjp": "Muffin", "/m/01z1kdw": "Juice",
    "/m/021mn": "Cookie", "/m/0270h": "Dessert", "/m/02vqfm": "Coffee",
    "/m/02xwb": "Fruit", "/m/033cnk": "Egg", "/m/0388q": "Grape",
    "/m/04zpv": "Milk", "/m/05vtc": "Potato", "/m/05z55": "Pasta",
    "/m/061_f": "Pear", "/m/0663v": "Pizza", "/m/06nwz": "Seafood",
    "/m/06pcq": "Submarine sandwich", "/m/07030": "Sushi", "/m/07crc": "Taco",
    "/m/07fbm7": "Strawberry", "/m/07j87": "Tomato", "/m/081qc": "Wine",
    "/m/09728": "Bread", "/m/09b5t": "Chicken", "/m/09gys": "Squid",
    "/m/09k_b": "Lemon", "/m/09qck": "Banana", "/m/0cdn1": "Hamburger",
    "/m/0ch_cf": "Fish", "/m/0cjq5": "Lobster", "/m/0cxn2": "Ice cream",
    "/m/0cyhj_": "Orange", "/m/0djtd": "Coconut", "/m/0f4s2w": "Vegetable",
    "/m/0fbdv": "Shellfish", "/m/0fbw6": "Cabbage", "/m/0fj52s": "Carrot",
    "/m/0fldg": "Mango", "/m/0fp6w": "Pineapple", "/m/0fszt": "Cake",
    "/m/0gm28": "Candy", "/m/0grw1": "Salad", "/m/0hkxq": "Broccoli",
    "/m/0hqkz": "Grapefruit", "/m/0jwn_": "Pomegranate", "/m/0jy4k": "Doughnut",
    "/m/0kpqd": "Watermelon", "/m/0l515": "Sandwich", "/m/0ll1f78": "Shrimp",
}


_local = threading.local()


def session() -> requests.Session:
    value = getattr(_local, "session", None)
    if value is None:
        value = requests.Session()
        retry = Retry(
            total=7, connect=7, read=7, backoff_factor=1.0,
            status_forcelist=(429, 500, 502, 503, 504), allowed_methods=("GET",),
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=MAX_WORKERS, pool_maxsize=MAX_WORKERS)
        value.mount("https://", adapter)
        value.headers["User-Agent"] = "ThriveLens-open-dataset-builder/1.0"
        _local.session = value
    return value


def get_bytes(url: str, timeout: int = 180) -> bytes:
    response = session().get(url, timeout=(20, timeout))
    response.raise_for_status()
    return response.content


def list_gcs(prefix: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    token = None
    while True:
        params = {"prefix": prefix, "maxResults": 1000}
        if token:
            params["pageToken"] = token
        response = session().get(NUTRITION_API, params=params, timeout=(30, 180))
        response.raise_for_status()
        page = response.json()
        items.extend(page.get("items", []))
        token = page.get("nextPageToken")
        if not token:
            return items


def gcs_url(name: str) -> str:
    return f"https://storage.googleapis.com/{NUTRITION_BUCKET}/{quote(name, safe='/')}"


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def split_for(group_id: str, train=90, val=5) -> str:
    bucket = int(hashlib.sha256(group_id.encode()).hexdigest()[:8], 16) % 100
    return "train" if bucket < train else ("val" if bucket < train + val else "test")


def json_answer(value: Any) -> str:
    return "<answer>" + json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "</answer>"


class ArchiveWriter:
    def __init__(self, path: Path):
        self.path = path
        self.zip = zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED, allowZip64=True)
        self.hashes: list[tuple[str, str, int]] = []
        self.source_bytes = Counter()
        self.source_files = Counter()

    def write(self, name: str, data: bytes, source: str, hash_content: bool = True):
        self.zip.writestr(name, data)
        self.source_bytes[source] += len(data)
        self.source_files[source] += 1
        if hash_content:
            self.hashes.append((hashlib.sha256(data).hexdigest(), name, len(data)))

    def write_file(self, name: str, path: Path, source: str):
        data = path.read_bytes()
        self.write(name, data, source)

    def close(self):
        self.zip.close()


def fetch_nutrition_object(item: dict[str, Any]):
    name = item["name"]
    raw = get_bytes(gcs_url(name), timeout=300)
    expected_size = int(item["size"])
    if len(raw) != expected_size:
        raise RuntimeError(f"Size mismatch for {name}: {len(raw)} != {expected_size}")
    expected_md5 = item.get("md5Hash")
    if expected_md5:
        actual = base64.b64encode(hashlib.md5(raw).digest()).decode()
        if actual != expected_md5:
            raise RuntimeError(f"MD5 mismatch for {name}")
    archive_name = "data/nutrition5k/" + name.removeprefix(NUTRITION_PREFIX)
    return archive_name, raw, name, expected_md5 or ""


def download_nutrition(writer: ArchiveWriter):
    print("Listing the official Nutrition5k bucket...", flush=True)
    overhead = list_gcs(NUTRITION_PREFIX + "imagery/realsense_overhead/")
    aux = []
    for subdir in ("metadata/", "dish_ids/", "scripts/"):
        aux.extend(list_gcs(NUTRITION_PREFIX + subdir))
    print(
        f"Nutrition5k: {len(overhead):,} overhead files / {sum(int(x['size']) for x in overhead)/2**30:.3f} GiB; "
        f"{len(aux):,} metadata/split/script files", flush=True,
    )
    aux_data: dict[str, bytes] = {}
    file_rows = []
    all_items = overhead + aux
    started = time.time()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(fetch_nutrition_object, item): item for item in all_items}
        for index, future in enumerate(as_completed(futures), 1):
            archive_name, raw, source_name, md5 = future.result()
            writer.write(archive_name, raw, "nutrition5k")
            if "/metadata/" in source_name or "/dish_ids/" in source_name:
                aux_data[source_name] = raw
            file_rows.append((source_name, archive_name, len(raw), md5))
            if index % 500 == 0 or index == len(all_items):
                rate = writer.source_bytes["nutrition5k"] / max(time.time() - started, 1) / 2**20
                print(f"  Nutrition5k {index:,}/{len(all_items):,} ({rate:.1f} MiB/s)", flush=True)

    output = io.StringIO()
    csv_writer = csv.writer(output)
    csv_writer.writerow(["official_object", "archive_path", "bytes", "gcs_md5_base64"])
    csv_writer.writerows(sorted(file_rows))
    writer.write("manifests/nutrition5k_files.csv", output.getvalue().encode(), "manifests")
    return overhead, aux_data


def select_openimages_boxes() -> list[dict[str, Any]]:
    print("Streaming the 2.26-GB official Open Images V6 box table...", flush=True)
    selected = defaultdict(list)
    counts = Counter()
    response = session().get(OPENIMAGES_BOXES, stream=True, timeout=(30, 600))
    response.raise_for_status()
    started = time.time()
    bytes_seen = 0
    for line_no, raw in enumerate(response.iter_lines(chunk_size=1024 * 1024), 1):
        bytes_seen += len(raw) + 1
        if line_no == 1 or not raw:
            continue
        # Fixed official schema; split is substantially faster than DictReader over 16M rows.
        parts = raw.decode("utf-8").split(",")
        if len(parts) < 13:
            continue
        mid = parts[2]
        if mid not in FOOD_CLASSES or len(selected[mid]) >= OPENIMAGES_PER_CLASS:
            continue
        try:
            xmin, xmax, ymin, ymax = map(float, parts[4:8])
            occluded, truncated, group_of, depiction, inside = map(int, parts[8:13])
        except ValueError:
            continue
        width, height = xmax - xmin, ymax - ymin
        area = width * height
        # Occlusion/truncation remain valid supervised examples and improve
        # real-world robustness; group/depiction/inside boxes are excluded.
        if group_of or depiction or inside:
            continue
        if width < 0.08 or height < 0.08 or area < 0.01 or area > 0.95:
            continue
        item = {
            "image_id": parts[0], "mid": mid, "label": FOOD_CLASSES[mid],
            "xmin": xmin, "xmax": xmax, "ymin": ymin, "ymax": ymax,
        }
        selected[mid].append(item)
        counts[mid] += 1
        if line_no % 2_000_000 == 0:
            print(
                f"  boxes: {line_no:,} rows, {bytes_seen/2**30:.2f} GiB, "
                f"{sum(counts.values()):,}/{len(FOOD_CLASSES)*OPENIMAGES_PER_CLASS:,} selected",
                flush=True,
            )
    response.close()
    missing = {FOOD_CLASSES[mid]: len(selected[mid]) for mid in FOOD_CLASSES if not selected[mid]}
    if missing:
        raise RuntimeError(f"No valid boxes found for classes: {missing}")
    result = [item for mid in FOOD_CLASSES for item in selected[mid]]
    print(f"Selected {len(result):,} clean boxes in {(time.time()-started)/60:.1f} min.", flush=True)
    return result


def load_openimages_attribution(image_ids: set[str]) -> dict[str, dict[str, str]]:
    print(f"Streaming official attribution metadata for {len(image_ids):,} selected image IDs...", flush=True)
    found: dict[str, dict[str, str]] = {}
    response = session().get(OPENIMAGES_METADATA, stream=True, timeout=(30, 600))
    response.raise_for_status()
    text = io.TextIOWrapper(response.raw, encoding="utf-8", newline="")
    reader = csv.DictReader(text)
    try:
        for index, row in enumerate(reader, 1):
            image_id = row.get("ImageID", "")
            if image_id in image_ids:
                license_url = row.get("License", "")
                if "creativecommons.org/licenses/by/2.0" in license_url:
                    found[image_id] = row
            if index % 500_000 == 0:
                print(f"  attribution: {index:,} rows, {len(found):,} matches", flush=True)
    except ValueError as exc:
        # urllib3 may mark the HTTP body closed immediately after the final
        # byte; TextIOWrapper then raises instead of returning StopIteration.
        if "closed file" not in str(exc).lower():
            raise
    finally:
        response.close()
    print(f"Found CC BY 2.0 attribution for {len(found):,}/{len(image_ids):,} selected images.", flush=True)
    return found


def crop_openimage(image_id: str, boxes: list[dict[str, Any]]):
    raw = get_bytes(OPENIMAGES_IMAGE.format(image_id=image_id), timeout=240)
    with Image.open(io.BytesIO(raw)) as original:
        original = ImageOps.exif_transpose(original).convert("RGB")
        width, height = original.size
        crops = []
        for ordinal, box in enumerate(boxes):
            x0, x1 = box["xmin"] * width, box["xmax"] * width
            y0, y1 = box["ymin"] * height, box["ymax"] * height
            pad_x, pad_y = (x1 - x0) * 0.05, (y1 - y0) * 0.05
            left, top = max(0, round(x0 - pad_x)), max(0, round(y0 - pad_y))
            right, bottom = min(width, round(x1 + pad_x)), min(height, round(y1 + pad_y))
            crop = original.crop((left, top, right, bottom))
            crop.thumbnail((512, 512), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            crop.save(output, format="JPEG", quality=90, optimize=True, progressive=True)
            crops.append((ordinal, output.getvalue(), (left, top, right, bottom), original.size))
    return image_id, crops


def download_openimages(writer: ArchiveWriter):
    boxes = select_openimages_boxes()
    by_image = defaultdict(list)
    for box in boxes:
        by_image[box["image_id"]].append(box)
    attribution = load_openimages_attribution(set(by_image))
    by_image = {key: value for key, value in by_image.items() if key in attribution}
    print(f"Downloading/cropping {sum(map(len, by_image.values())):,} boxes from {len(by_image):,} originals...", flush=True)

    records = {"train": [], "val": [], "test": []}
    attribution_rows = []
    box_rows = []
    class_counts = Counter()
    failures = []
    started = time.time()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(crop_openimage, image_id, image_boxes): image_id for image_id, image_boxes in by_image.items()}
        for index, future in enumerate(as_completed(futures), 1):
            image_id = futures[future]
            try:
                _, crops = future.result()
            except Exception as exc:
                failures.append((image_id, repr(exc)))
                continue
            image_boxes = by_image[image_id]
            meta = attribution[image_id]
            split = split_for(image_id)
            for (ordinal, crop_bytes, pixel_box, original_size), box in zip(crops, image_boxes):
                label_slug = slug(box["label"])
                archive_path = f"data/open_images_food/images/{label_slug}/{image_id}_{ordinal:02d}.jpg"
                writer.write(archive_path, crop_bytes, "open_images_food")
                sample_id = f"openimages_{image_id}_{ordinal:02d}_{label_slug}"
                records[split].append({
                    "id": sample_id,
                    "group_id": f"openimages::{image_id}",
                    "task": "food_classification",
                    "source": "Open Images V7/V6 boxes",
                    "image": f"zip://{archive_path}",
                    "conversations": [
                        {"from": "human", "value": "<image>\nIdentify the primary food item in this image. Return only the most specific food name inside <answer> tags."},
                        {"from": "gpt", "value": f"<answer>{box['label']}</answer>"},
                    ],
                })
                class_counts[box["label"]] += 1
                box_rows.append([
                    sample_id, split, image_id, box["mid"], box["label"],
                    box["xmin"], box["xmax"], box["ymin"], box["ymax"],
                    *pixel_box, *original_size, archive_path,
                ])
                attribution_rows.append([
                    sample_id, image_id, meta.get("OriginalURL", ""), meta.get("OriginalLandingURL", ""),
                    meta.get("License", ""), meta.get("AuthorProfileURL", ""), meta.get("Author", ""),
                    meta.get("Title", ""), archive_path,
                ])
            if index % 500 == 0 or index == len(futures):
                rate = writer.source_bytes["open_images_food"] / max(time.time() - started, 1) / 2**20
                print(f"  Open Images {index:,}/{len(futures):,} originals ({rate:.1f} MiB/s; {len(failures)} failures)", flush=True)

    output = io.StringIO()
    cw = csv.writer(output)
    cw.writerow(["sample_id", "split", "image_id", "label_mid", "label", "xmin_norm", "xmax_norm", "ymin_norm", "ymax_norm",
                 "left_px", "top_px", "right_px", "bottom_px", "original_width", "original_height", "archive_path"])
    cw.writerows(box_rows)
    writer.write("manifests/open_images_food_boxes.csv", output.getvalue().encode(), "manifests")

    output = io.StringIO()
    cw = csv.writer(output)
    cw.writerow(["sample_id", "image_id", "original_url", "original_landing_url", "license", "author_profile_url", "author", "title", "archive_path"])
    cw.writerows(attribution_rows)
    writer.write("manifests/open_images_food_attribution.csv", output.getvalue().encode(), "manifests")

    if failures:
        output = io.StringIO()
        cw = csv.writer(output)
        cw.writerow(["image_id", "error"])
        cw.writerows(failures)
        writer.write("manifests/open_images_download_failures.csv", output.getvalue().encode(), "manifests")
    print(f"Open Images crops written: {sum(class_counts.values()):,}; failures: {len(failures):,}", flush=True)
    return records, class_counts, failures


def add_fruits360(writer: ArchiveWriter):
    """Add every official Fruits-360 100x100 Training/Test image."""
    if not FRUITS_ARCHIVE.is_file():
        raise FileNotFoundError(f"Download the official Fruits-360 archive first: {FRUITS_ARCHIVE}")
    records = {"train": [], "val": [], "test": []}
    class_counts = Counter()
    split_counts = Counter()
    license_files = []
    started = time.time()
    with zipfile.ZipFile(FRUITS_ARCHIVE, "r") as source:
        infos = source.infolist()
        image_infos = [
            info for info in infos
            if not info.is_dir()
            and info.filename.lower().endswith((".jpg", ".jpeg", ".png"))
            and ("/Training/" in info.filename or "/Test/" in info.filename)
        ]
        for info in infos:
            if info.is_dir():
                continue
            basename = Path(info.filename).name.lower()
            if basename in {"license", "license.txt", "readme.md", "readme.txt"}:
                raw = source.read(info)
                archive_name = f"source_tables/fruits360/{Path(info.filename).name}"
                writer.write(archive_name, raw, "source_tables")
                license_files.append(archive_name)

        print(f"Fruits-360: adding {len(image_infos):,} official 100x100 images...", flush=True)
        for index, info in enumerate(image_infos, 1):
            parts = Path(info.filename).parts
            marker = "Training" if "Training" in parts else "Test"
            marker_index = parts.index(marker)
            relative_parts = parts[marker_index:]
            if len(relative_parts) < 3:
                continue
            label = relative_parts[1]
            split = "train" if marker == "Training" else "test"
            raw = source.read(info)
            archive_path = "data/fruits360/" + "/".join(relative_parts)
            writer.write(archive_path, raw, "fruits360")
            sample_id = "fruits360_" + hashlib.sha256(info.filename.encode()).hexdigest()[:20]
            records[split].append({
                "id": sample_id,
                "group_id": f"fruits360::{marker}::{label}::{Path(info.filename).stem}",
                "task": "produce_variety_classification",
                "source": "Fruits-360 100x100",
                "image": f"zip://{archive_path}",
                "conversations": [
                    {"from": "human", "value": "<image>\nIdentify the fruit, vegetable, nut, seed, or fungus variety shown. Return only the most specific class name inside <answer> tags."},
                    {"from": "gpt", "value": f"<answer>{label}</answer>"},
                ],
            })
            class_counts[label] += 1
            split_counts[split] += 1
            if index % 20_000 == 0 or index == len(image_infos):
                rate = writer.source_bytes["fruits360"] / max(time.time() - started, 1) / 2**20
                print(f"  Fruits-360 {index:,}/{len(image_infos):,} ({rate:.1f} MiB/s)", flush=True)

    if sum(split_counts.values()) < 180_000:
        raise RuntimeError(f"Expected at least 180,000 Fruits-360 images; found {sum(split_counts.values()):,}")
    print(f"Fruits-360 written: {sum(split_counts.values()):,} images / {len(class_counts)} classes", flush=True)
    return records, class_counts, split_counts, license_files


def parse_nutrition_metadata(aux_data: dict[str, bytes]) -> dict[str, dict[str, Any]]:
    dishes = {}
    for name, raw in aux_data.items():
        if "/metadata/dish_metadata_" not in name:
            continue
        for row in csv.reader(io.StringIO(raw.decode("utf-8"))):
            if len(row) < 6:
                continue
            dish_id = row[0]
            ingredients = []
            for offset in range(6, len(row) - 6, 7):
                chunk = row[offset:offset + 7]
                if len(chunk) < 7:
                    continue
                ingredients.append({
                    "id": chunk[0], "name": chunk[1], "grams": round(float(chunk[2]), 3),
                    "calories": round(float(chunk[3]), 3), "fat_g": round(float(chunk[4]), 3),
                    "carb_g": round(float(chunk[5]), 3), "protein_g": round(float(chunk[6]), 3),
                })
            dishes[dish_id] = {
                "dish_id": dish_id, "total_calories": round(float(row[1]), 2),
                "mass_g": round(float(row[2]), 2), "fat_g": round(float(row[3]), 2),
                "carb_g": round(float(row[4]), 2), "protein_g": round(float(row[5]), 2),
                "ingredients": ingredients,
            }
    return dishes


def nutrition_split_ids(aux_data: dict[str, bytes]):
    train_ids, test_ids = set(), set()
    for name, raw in aux_data.items():
        ids = {line.strip() for line in raw.decode("utf-8", errors="ignore").splitlines() if line.strip().startswith("dish_")}
        lower = name.lower()
        if "rgb_train_ids" in lower:
            train_ids |= ids
        elif "rgb_test_ids" in lower:
            test_ids |= ids
    return train_ids, test_ids


def build_nutrition_records(overhead, aux_data):
    available = defaultdict(set)
    for item in overhead:
        parts = item["name"].split("/")
        if len(parts) >= 2:
            available[parts[-2]].add(parts[-1])
    dishes = parse_nutrition_metadata(aux_data)
    official_train, official_test = nutrition_split_ids(aux_data)
    records = {"train": [], "val": [], "test": []}
    used = 0
    for dish_id in sorted(set(dishes) & set(available)):
        if not {"rgb.png", "depth_color.png"}.issubset(available[dish_id]):
            continue
        if dish_id in official_test:
            split = "test"
        elif dish_id in official_train:
            split = "val" if split_for(dish_id, train=90, val=10) == "val" else "train"
        else:
            split = split_for(dish_id)
        dish = dishes[dish_id]
        rgb = f"data/nutrition5k/imagery/realsense_overhead/{dish_id}/rgb.png"
        depth = f"data/nutrition5k/imagery/realsense_overhead/{dish_id}/depth_color.png"
        ingredient_names = [item["name"] for item in dish["ingredients"]]
        nutrition = {key: dish[key] for key in ("mass_g", "total_calories", "fat_g", "carb_g", "protein_g")}
        full = {**nutrition, "ingredients": dish["ingredients"]}
        common = {"group_id": f"nutrition5k::{dish_id}", "source": "Nutrition5k"}
        records[split].extend([
            {
                **common, "id": f"nutrition5k_{dish_id}_ingredients", "task": "ingredient_recognition",
                "image": f"zip://{rgb}",
                "conversations": [
                    {"from": "human", "value": "<image>\nList the visible food ingredients in this plated meal. Return JSON inside <answer> tags."},
                    {"from": "gpt", "value": json_answer({"ingredients": ingredient_names})},
                ],
            },
            {
                **common, "id": f"nutrition5k_{dish_id}_nutrition", "task": "nutrition_estimation",
                "image": [f"zip://{rgb}", f"zip://{depth}"],
                "conversations": [
                    {"from": "human", "value": "<image>\n<image>\nThe first image is RGB and the second is its colorized depth map. Estimate total plated mass, calories, fat, carbohydrate, and protein. Return numeric JSON inside <answer> tags."},
                    {"from": "gpt", "value": json_answer(nutrition)},
                ],
            },
            {
                **common, "id": f"nutrition5k_{dish_id}_full", "task": "full_food_analysis",
                "image": [f"zip://{rgb}", f"zip://{depth}"],
                "conversations": [
                    {"from": "human", "value": "<image>\n<image>\nAnalyze this meal using the RGB image and colorized depth map. Return ingredient identities and amounts plus total mass, calories, fat, carbohydrate, and protein as JSON inside <answer> tags."},
                    {"from": "gpt", "value": json_answer(full)},
                ],
            },
        ])
        used += 1
    print(f"Nutrition5k supervised dishes: {used:,}; records: {used*3:,}", flush=True)
    return records, used


def add_repository(writer: ArchiveWriter, repo_dir: Path, archive_root: str):
    excluded = {".git", "__pycache__", ".pytest_cache"}
    for path in sorted(repo_dir.rglob("*")):
        if not path.is_file() or any(part in excluded for part in path.parts):
            continue
        writer.write_file(f"{archive_root}/{path.relative_to(repo_dir).as_posix()}", path, "training_code")


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        raise SystemExit(f"Refusing to overwrite existing archive: {OUT}")
    writer = ArchiveWriter(OUT)
    try:
        # Source tables/licenses used to audit every redistributed byte.
        writer.write("manifests/open_images_food_classes_selected.json", json.dumps(FOOD_CLASSES, indent=2).encode(), "manifests")
        writer.write("source_tables/open_images_class_descriptions_boxable.csv", get_bytes(OPENIMAGES_CLASSES), "source_tables")

        overhead, aux_data = download_nutrition(writer)
        open_records, class_counts, failures = download_openimages(writer)
        fruits_records, fruits_class_counts, fruits_split_counts, fruits_license_files = add_fruits360(writer)
        nutrition_records, nutrition_dishes = build_nutrition_records(overhead, aux_data)

        combined = {}
        split_task_counts = {}
        for split in ("train", "val", "test"):
            rows = open_records[split] + fruits_records[split] + nutrition_records[split]
            random.Random(SEED + {"train": 1, "val": 2, "test": 3}[split]).shuffle(rows)
            combined[split] = rows
            split_task_counts[split] = dict(Counter(row["task"] for row in rows))
            writer.write(f"sft/{split}.json", json.dumps(rows, ensure_ascii=False).encode(), "sft_manifests")
            jsonl = b"\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode() for row in rows) + b"\n"
            writer.write(f"sft/{split}.jsonl", jsonl, "sft_manifests")

        # Bundle the actual validated implementation, not an unpinned runtime clone.
        add_repository(writer, ROOT / "qwen-vl-finetune", "training/qwen-vl-finetune")
        writer.write("training/qwen-vl-finetune/PINNED_COMMIT.txt", b"70c7b2fcb0e276b1fa4b136852e9b862ce8730fa\n", "training_code")
        for path in sorted((ROOT / "bundle_files").rglob("*")):
            if path.is_file():
                writer.write_file(path.relative_to(ROOT / "bundle_files").as_posix(), path, "training_code")

        licenses = {
            "LICENSES/Nutrition5k_CC_BY_4.0.md": """# Nutrition5k license notice\n\nDataset: Nutrition5k, Google Research.\nOfficial source: https://github.com/google-research-datasets/Nutrition5k\nLicense: Creative Commons Attribution 4.0 International (CC BY 4.0).\nLicense text: https://creativecommons.org/licenses/by/4.0/\n\nThe archive retains the official filenames, metadata, split lists, and scripts. Attribution: Thames et al., Nutrition5k: Towards Automatic Nutritional Understanding of Generic Food (CVPR 2021).\n""",
            "LICENSES/Open_Images_CC_BY_2.0.md": """# Open Images image license and attribution notice\n\nDataset: Open Images. Official download page: https://storage.googleapis.com/openimages/web/download_v7.html\nOfficial facts: https://storage.googleapis.com/openimages/web/factsfigures_v7.html\nImage license: CC BY 2.0; annotation license: CC BY 4.0.\nLicense texts: https://creativecommons.org/licenses/by/2.0/ and https://creativecommons.org/licenses/by/4.0/\n\nEvery redistributed crop has its original URL, landing page, author/profile, title, and exact license URL in `manifests/open_images_food_attribution.csv`. Cropping/resizing are ThriveLens modifications. Users should preserve that attribution when redistributing derivatives.\n""",
            "LICENSES/Training_code_Apache_2.0.md": """# Training implementation\n\nThe bundled Qwen-VL-Series-Finetune source is Apache-2.0 and pinned to commit 70c7b2fcb0e276b1fa4b136852e9b862ce8730fa. Its upstream license file is included inside its directory. Food-R1 is loaded from `zy12123/Food-R1`; review its model card and Apache-2.0 license before deployment.\n""",
            "LICENSES/Fruits360_LICENSE.md": """# Fruits-360 license and provenance\n\nDataset: Fruits-360 100x100.\nOfficial source: https://github.com/fruits-360/fruits-360-100x100\nAuthor: Mihai Oltean.\n\nThe exact upstream LICENSE and README files from the downloaded source revision are preserved under `source_tables/fruits360/`. The images were captured by the dataset author from objects grown or purchased by the author; they were not scraped or artificially generated. Preserve the upstream copyright and citation notice when redistributing.\n""",
        }
        for name, text in licenses.items():
            writer.write(name, text.encode(), "licenses")

        summary = {
            "nutrition5k_overhead_files": len(overhead),
            "nutrition5k_overhead_dishes": len({item["name"].split("/")[-2] for item in overhead}),
            "nutrition5k_supervised_dishes": nutrition_dishes,
            "open_images_food_crops": sum(class_counts.values()),
            "open_images_food_classes": len(class_counts),
            "fruits360_images": sum(fruits_split_counts.values()),
            "fruits360_classes": len(fruits_class_counts),
            "fruits360_split_counts": dict(fruits_split_counts),
            "sft_records": {split: len(rows) for split, rows in combined.items()},
            "sft_tasks": split_task_counts,
            "source_payload_bytes": dict(writer.source_bytes),
        }
        total_supervised_records = sum(len(rows) for rows in combined.values())
        if total_supervised_records < 200_000:
            raise RuntimeError(f"Expanded corpus target missed: {total_supervised_records:,} < 200,000")
        manifest = {
            "name": "ThriveLens Open Food 300K + Nutrition5k Food-R1 Kaggle package",
            "version": "2.0.0",
            "created_utc": "2026-09-02",
            "random_seed": SEED,
            "summary": summary,
            "sources": [
                {"name": "Nutrition5k", "license": "CC BY 4.0", "url": "https://github.com/google-research-datasets/Nutrition5k",
                 "included": "all official RealSense overhead RGB, raw depth, colorized depth, metadata, dish IDs/splits, scripts"},
                {"name": "Open Images", "image_license": "CC BY 2.0", "annotation_license": "CC BY 4.0",
                 "url": "https://storage.googleapis.com/openimages/web/download_v7.html",
                 "included": "clean food bounding-box crops with per-image attribution"},
                {"name": "Fruits-360 100x100", "url": "https://github.com/fruits-360/fruits-360-100x100",
                 "included": "all official Training and Test images across fruits, vegetables, nuts, seeds and fungi",
                 "upstream_license_files": fruits_license_files},
            ],
            "open_images_sampling": {
                "requested_per_class": OPENIMAGES_PER_CLASS,
                "filters": {"group_of": 0, "depiction": 0, "inside": 0,
                            "occluded_or_truncated": "allowed for real-world robustness",
                            "min_width": 0.08, "min_height": 0.08, "min_area": 0.01, "max_area": 0.95},
                "class_counts": dict(sorted(class_counts.items())),
                "download_failures": len(failures),
                "crop": "5% context padding, max 512x512, JPEG quality 90",
            },
            "split_policy": "Open Images uses a group-safe deterministic SHA-256 split by original photo. Nutrition5k official test IDs remain test and 10% of official train IDs become validation. Fruits-360 preserves its official Training/Test split.",
            "training": {"base_model": "zy12123/Food-R1", "method": "two-GPU FP16 NF4 QLoRA", "epochs": 3,
                         "early_stopping": False, "notebook": "notebooks/ThriveLens_FoodR1_Dual_T4_QLoRA.ipynb"},
        }
        writer.write("dataset_manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False).encode(), "manifests")

        readme = f"""# ThriveLens 300K real-image Food-R1 Kaggle package\n\nThis is a real, self-contained image dataset and training implementation. It contains all {len(overhead):,} official Nutrition5k RealSense overhead files ({nutrition_dishes:,} metadata-linked dishes), {sum(class_counts.values()):,} clean attributed Open Images food crops across {len(class_counts)} food classes, and all {sum(fruits_split_counts.values()):,} official Fruits-360 100x100 images across {len(fruits_class_counts)} produce classes. Images are bytes inside this ZIP, not URL placeholders or runtime download instructions.\n\nThe combined supervised corpus contains {total_supervised_records:,} records.\n\n## Start\n\n1. Upload this ZIP as a Kaggle Dataset and attach it to a notebook.\n2. Open `notebooks/ThriveLens_FoodR1_Dual_T4_QLoRA.ipynb`.\n3. Select GPU T4 x2, enable Internet for the public Food-R1 weight download, and Run All.\n4. Download `ThriveLens_FoodR1_QLoRA_Adapter.zip` from Kaggle Output.\n\nThe notebook streams images directly from this archive, uses both GPUs, trains for exactly three epochs without early stopping, validates each epoch, resumes checkpoints across interrupted or quota-limited sessions, and performs deterministic held-out testing. Set `MAX_TEST_SAMPLES=0` for the complete test set.\n\n## Important licensing\n\nNutrition5k is CC BY 4.0. Open Images annotations are CC BY 4.0 and the included images are individually recorded as CC BY 2.0; preserve `manifests/open_images_food_attribution.csv` when redistributing. Fruits-360 retains its exact upstream LICENSE, README, provenance, and citation files. See `LICENSES/` and `source_tables/fruits360/`.\n"""
        writer.write("README.md", readme.encode(), "manifests")

        sums = "".join(f"{digest}  {name}  # {size} bytes\n" for digest, name, size in sorted(writer.hashes))
        writer.write("SHA256SUMS.txt", sums.encode(), "manifests", hash_content=False)
    finally:
        writer.close()

    digest = hashlib.sha256()
    with OUT.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    print(json.dumps({
        "archive": str(OUT), "bytes": OUT.stat().st_size, "gib": round(OUT.stat().st_size / 2**30, 3),
        "sha256": digest.hexdigest(), "source_files": dict(writer.source_files),
        "source_bytes": dict(writer.source_bytes),
    }, indent=2), flush=True)


if __name__ == "__main__":
    main()
