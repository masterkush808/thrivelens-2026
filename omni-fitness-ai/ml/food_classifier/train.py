"""Train a MobileNetV2 food classifier for ThriveLens' on-device fallback.

Runs on CPU in minutes (bottleneck features are cached to disk once), then
exports every artifact the app bundles straight into the app's assets:

  assets/ml/food_model.h5           Keras backup model
  assets/ml/tfjs/model.json         TF.js Layers model (Expo Go compatible)
  assets/ml/tfjs/group1-shard*.bin  TF.js weights
  assets/ml/food_model.tflite       TFLite int8 (for dev-build runtimes)
  assets/ml/labels.json             class index <-> label
  assets/ml/labels.txt              plain label list

The train/val/test split comes from the ThriveLens SFT manifest (leakage-safe,
group-split). Corrupt or unreadable images are skipped and reported instead of
crashing the run.

Layout:
  data/
    train/<Class>/*.jpg     training crops (class-capped, see MAX_PER_CLASS)
    val/<Class>/*.jpg       held-out crops (leakage-safe, never in training)

Default output dir is <repo-root>/assets/ml so the app picks the model up
without any copying step. Override with TL_DATA / TL_OUT env vars.
"""
import json
import os
import sys
import time

import numpy as np

# tfjs 3.x references removed numpy aliases; restore them for the converter.
np.object = object
np.bool = bool
np.int = int
np.float = float
np.complex = complex

import tensorflow as tf

try:
    tf.config.threading.set_intra_op_parallelism_threads(6)
    tf.config.threading.set_inter_op_parallelism_threads(2)
except Exception:
    pass

_HERE = os.path.dirname(os.path.abspath(__file__))
_AAPPS_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))

IMG_SIZE = int(os.environ.get("IMG_SIZE", "160"))
BATCH = int(os.environ.get("BATCH", "32"))
HEAD_EPOCHS = int(os.environ.get("HEAD_EPOCHS", "40"))
HEAD_LR = float(os.environ.get("HEAD_LR", "1e-3"))
FINE_EPOCHS = int(os.environ.get("FINE_EPOCHS", "0"))
FINE_LR = float(os.environ.get("FINE_LR", "1e-4"))
UNFREEZE_LAST = int(os.environ.get("UNFREEZE_LAST", "20"))
FT_BATCH = int(os.environ.get("FT_BATCH", "8"))
MAX_PER_CLASS = int(os.environ.get("MAX_PER_CLASS", "250"))
FEATURE_CACHE = os.environ.get("FEATURE_CACHE", "")
DATA = os.environ.get("TL_DATA", os.path.join(_HERE, "data"))
OUT = os.environ.get("TL_OUT", os.path.join(_AAPPS_ROOT, "assets", "ml"))
os.makedirs(os.path.join(OUT, "tfjs"), exist_ok=True)

if not os.path.isdir(os.path.join(DATA, "train")):
    raise SystemExit(
        f"[train] data/train not found under {DATA}.\n"
        f"Populate data/train/<Class>/*.jpg and data/val/<Class>/*.jpg "
        f"(from the ThriveLens SFT manifest), or point TL_DATA at the "
        f"extracted split directory."
    )


def load_dir(data_dir, max_per_class=None):
    """Directory loader -> (images ndarray uint8, labels ndarray, count_skipped).

    Corrupt / unreadable files are skipped so one bad crop cannot abort the run.
    """
    label_dirs = sorted(
        d for d in os.listdir(data_dir)
        if os.path.isdir(os.path.join(data_dir, d))
    )
    imgs, labels, skipped = [], [], 0
    for lbl, d in enumerate(label_dirs):
        files = sorted(os.listdir(os.path.join(data_dir, d)))
        if max_per_class:
            files = files[:max_per_class]
        for f in files:
            p = os.path.join(data_dir, d, f)
            try:
                arr = tf.keras.utils.load_img(p, target_size=(IMG_SIZE, IMG_SIZE))
            except Exception:
                skipped += 1
                continue
            imgs.append(np.asarray(arr))
            labels.append(lbl)
    if not imgs:
        raise RuntimeError(f"No readable images under {data_dir}")
    return np.stack(imgs), np.array(labels, dtype=np.int64), label_dirs, skipped


print(f"[train] imgsize={IMG_SIZE} head_epochs={HEAD_EPOCHS} head_lr={HEAD_LR} "
      f"fine_epochs={FINE_EPOCHS} unfreeze_last={UNFREEZE_LAST} max_per_class={MAX_PER_CLASS}", flush=True)

t0 = time.time()
train_imgs, train_labels, class_names, train_skipped = load_dir(os.path.join(DATA, "train"), MAX_PER_CLASS)
val_imgs, val_labels, val_names, val_skipped = load_dir(os.path.join(DATA, "val"))
assert class_names == val_names, (class_names, val_names)
n_classes = len(class_names)
print(f"[train] load ok in {(time.time()-t0)/60:.2f} min; skipped train={train_skipped} val={val_skipped}", flush=True)
print(f"[train] train={train_imgs.shape} val={val_imgs.shape} classes={n_classes}", flush=True)

# Class-balanced weights so the softmax head cannot collapse to majority classes.
counts = np.bincount(train_labels).astype(np.float64)
class_weight = {c: float(len(train_labels) / (n_classes * max(counts[c], 1))) for c in range(n_classes)}
print("[train] class weights:", {class_names[c]: round(w, 3) for c, w in class_weight.items()}, flush=True)

with open(os.path.join(OUT, "labels.json"), "w") as fh:
    json.dump({"labels": class_names, "count": n_classes}, fh, indent=2, sort_keys=True)
with open(os.path.join(OUT, "labels.txt"), "w") as fh:
    fh.write("\n".join(class_names))

# Cache bottleneck features once with the frozen base (fast on CPU, resumable).
base_full = tf.keras.applications.MobileNetV2(
    input_shape=(IMG_SIZE, IMG_SIZE, 3), include_top=False, weights="imagenet", pooling="avg"
)
base_full.trainable = False
pre = tf.keras.applications.mobilenet_v2.preprocess_input


def encode(save_path, imgs, bs=64):
    if save_path and os.path.exists(save_path):
        arr = np.load(save_path)
        print(f"[train] loaded cached features {save_path} ({arr.shape})", flush=True)
        return arr
    feas = []
    for i in range(0, len(imgs), bs):
        chunk = pre(tf.cast(tf.constant(imgs[i:i + bs]), tf.float32))
        feas.append(base_full(chunk, training=False).numpy())
    arr = np.concatenate(feas, axis=0)
    if save_path:
        np.save(save_path, arr)
    return arr


cache = FEATURE_CACHE or os.path.join(OUT, "features.npz")
train_cache = cache + "_train.npy"
val_cache = cache + "_val.npy"
print("[train] caching bottleneck features (frozen base)…", flush=True)
t0 = time.time()
train_feats = encode(train_cache, train_imgs)
val_feats = encode(val_cache, val_imgs)
print(f"[train] features cached in {(time.time() - t0) / 60:.2f} min", flush=True)
print(f"[train] features shapes train={train_feats.shape} val={val_feats.shape}", flush=True)

# Head only. Early stopping (best-val) keeps the frozen-feature baseline
# strong; fine-tuning the GNetV2 trunk on this 8 GiB CPU box consistently
# degraded it (backprop diverges without a GPU/big-batch regime).
head = tf.keras.Sequential(
    [
        tf.keras.layers.Dropout(0.25, input_shape=(train_feats.shape[1],)),
        tf.keras.layers.Dense(n_classes, activation="softmax"),
    ]
)
head.compile(
    optimizer=tf.keras.optimizers.Adam(HEAD_LR),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"],
)
print("[train] training head…", flush=True)
t0 = time.time()
head.fit(
    train_feats, train_labels, validation_data=(val_feats, val_labels),
    epochs=HEAD_EPOCHS, batch_size=BATCH, verbose=2,
    class_weight=class_weight,
    callbacks=[
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy", patience=8, restore_best_weights=True, verbose=1
        )
    ],
)
best_val = max(head.history.history.get("val_accuracy", [0.0]))
print(f"[train] head done in {(time.time() - t0) / 60:.2f} min; best val_accuracy={best_val:.4f}", flush=True)

# Rebuild full model (base + dense head), copy the trained head weights.
dense_head = tf.keras.layers.Dense(n_classes, activation="softmax")
inputs = tf.keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
x = pre(inputs)
x = base_full(x, training=False)
x = dense_head(x)
model = tf.keras.Model(inputs, x)
dense_head.set_weights(head.layers[1].get_weights())
model.compile(
    optimizer=tf.keras.optimizers.Adam(1e-3),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"],
)
del head
import gc as _gc
_gc.collect()


def data_gen(imgs, labels, bs):
    # Lazy float32 cast: never materialize the full dataset as fp32 (OOM-safe on 8 GiB hosts).
    ds = tf.data.Dataset.from_tensor_slices((imgs.astype(np.uint8), labels))
    ds = ds.map(lambda _im, _lb: (tf.cast(_im, tf.float32), _lb),
                num_parallel_calls=tf.data.AUTOTUNE)
    return ds.batch(bs).cache().shuffle(2000).prefetch(tf.data.AUTOTUNE)


if FINE_EPOCHS > 0:
    print(f"[train] fine-tuning last {UNFREEZE_LAST} layers, lr={FINE_LR}, class_weighted…", flush=True)
    base_full.trainable = True
    for layer in base_full.layers[:-UNFREEZE_LAST]:
        layer.trainable = False
    t0 = time.time()
    # Small-batch, no-cache generator to stay inside host RAM on CPU.
    # Light augmentation regularizes the head's overfit (train was ~0.84 vs val ~0.55).
    def aug(_im, _lb):
        _im = tf.cast(_im, tf.float32)
        _im = tf.image.random_flip_left_right(_im)
        _im = tf.image.random_brightness(_im, 0.15)
        _im = tf.image.random_contrast(_im, 0.8, 1.2)
        return _im, _lb

    ds = tf.data.Dataset.from_tensor_slices((train_imgs.astype(np.uint8), train_labels))
    ds = ds.map(aug, num_parallel_calls=tf.data.AUTOTUNE)
    ds = ds.batch(FT_BATCH).shuffle(1024).prefetch(2)
    vds = tf.data.Dataset.from_tensor_slices((val_imgs.astype(np.uint8), val_labels))
    vds = vds.map(lambda _im, _lb: (tf.cast(_im, tf.float32), _lb),
                  num_parallel_calls=tf.data.AUTOTUNE)
    vds = vds.batch(FT_BATCH // 2).prefetch(2)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(FINE_LR),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.fit(ds, validation_data=vds,
              epochs=FINE_EPOCHS, verbose=2,
              class_weight=class_weight)
    print(f"[train] fine-tune done in {(time.time() - t0) / 60:.2f} min", flush=True)
    base_full.trainable = False
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

# Held-out validation on the val split (leakage-safe, never used in training).
val_loss, val_acc = model.evaluate(data_gen(val_imgs, val_labels, BATCH), verbose=0)
print(f"[train] HELD-OUT VALIDATION: loss={val_loss:.4f} accuracy={val_acc:.4f}", flush=True)

model.save(os.path.join(OUT, "food_model.h5"))
print(f"[train] saved {os.path.join(OUT, 'food_model.h5')}", flush=True)

print("[train] exporting TF.js…", flush=True)
import tensorflowjs as tfjs  # noqa: E402
from tensorflowjs.converters import converter as _conv  # noqa: E402
_conv.dispatch_keras_h5_to_tfjs_layers_model_conversion(
    os.path.join(OUT, "food_model.h5"),
    output_dir=os.path.join(OUT, "tfjs"),
)
print(f"[train] TF.js export -> {os.path.join(OUT, 'tfjs')}", flush=True)

print("[train] exporting TFLite…", flush=True)
try:
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_bytes = converter.convert()
    with open(os.path.join(OUT, "food_model.tflite"), "wb") as fh:
        fh.write(tflite_bytes)
    print(f"[train] TFLite export -> {os.path.join(OUT, 'food_model.tflite')} "
          f"({len(tflite_bytes)/2**20:.1f} MiB)", flush=True)
except Exception as exc:
    print(f"[train TFLITE WARNING] export failed: {type(exc).__name__}: {exc}", flush=True)

# Per-class accuracy breakdown on held-out val.
preds = np.argmax(model.predict(data_gen(val_imgs, val_labels, BATCH), verbose=0), axis=1)
correct_per = {}
total_per = {}
for p, t in zip(preds, val_labels):
    total_per[int(t)] = total_per.get(int(t), 0) + 1
    if p == t:
        correct_per[int(t)] = correct_per.get(int(t), 0) + 1
summary = {"train_samples": int(len(train_imgs)), "val_samples": int(len(val_imgs)),
           "skipped": {"train": train_skipped, "val": val_skipped},
           "val_loss": float(val_loss), "val_accuracy": float(val_acc)}
print("[train] per-class accuracy (held-out val):")
for c in range(n_classes):
    n = total_per.get(c, 0)
    if n:
        correct = correct_per.get(c, 0)
        summary.setdefault("per_class", {})[class_names[c]] = {"correct": correct, "total": n, "accuracy": round(correct / n, 4)}
        print(f"  {class_names[c]:28s} {correct/n:.3f}  ({correct}/{n})", flush=True)
with open(os.path.join(OUT, "metrics.json"), "w") as fh:
    json.dump(summary, fh, indent=2, sort_keys=True)
print("[train] DONE", flush=True)