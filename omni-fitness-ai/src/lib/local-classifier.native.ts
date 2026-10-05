/**
 * On-device MobileNetV2 fallback classifier - NATIVE ONLY.
 *
 * Metro resolves this file for ios/android and picks `local-classifier.web.ts`
 * for web, which keeps @tensorflow/tfjs out of the browser bundle entirely.
 *
 * Do not import @tensorflow/tfjs from any file reachable on web: its threaded
 * WASM worker backend evaluates `new SharedArrayBuffer(...)` at module scope,
 * which throws in a non-cross-origin-isolated document and takes down the
 * whole app.
 */
import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";

import type { AnalyzeResult, FoodCandidate } from "@/services/inference";

export const LOCAL_MODEL_REVISION = "tfjs/mobilenetv2";

const LOCAL_INPUT_SIZE = 160;
const LOCAL_TOP_K = 5;
const LOCAL_MIN_CONFIDENCE = 0.08;

export interface LocalClassifier {
  runner(uri: string): Promise<AnalyzeResult>;
}

function buildRequestId(): string {
  return Crypto.randomUUID();
}

let localModelPromise: Promise<LocalClassifier | null> | null = null;

export function classifyLocally(uri: string): Promise<AnalyzeResult | null> {
  if (!localModelPromise) {
    localModelPromise = loadLocalClassifier();
  }
  return localModelPromise.then((classifier) =>
    classifier ? classifier.runner(uri) : null,
  );
}

async function loadLocalClassifier(): Promise<LocalClassifier | null> {
  try {
    const tf = await import("@tensorflow/tfjs");
    const tfrn = await import("@tensorflow/tfjs-react-native");
    await tf.ready();
    try {
      await tf.setBackend("rn-webgl");
    } catch {
      await tf.setBackend("cpu");
    }

    const modelJson = require("@/assets/ml/tfjs/model.json");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shard1 = require("@/assets/ml/tfjs/group1-shard1of3.bin");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shard2 = require("@/assets/ml/tfjs/group1-shard2of3.bin");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shard3 = require("@/assets/ml/tfjs/group1-shard3of3.bin");
    const model = await tf.loadLayersModel(
      tfrn.bundleResourceIO(modelJson, [shard1, shard2, shard3]),
    );

    const labelsRecord = require("@/assets/ml/labels.json") as { labels?: string[] };
    const labels: string[] = labelsRecord.labels ?? [];

    const runner: LocalClassifier["runner"] = async (photoUri) => {
      let pre: import("@tensorflow/tfjs").Tensor | null = null;
      let batched: import("@tensorflow/tfjs").Tensor | null = null;
      let logits: import("@tensorflow/tfjs").Tensor | null = null;
      try {
        const base64 = await FileSystem.readAsStringAsync(photoUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        // decodeJpeg yields uint8 [0,255]; the exported TF.js graph embeds the
        // mobilenet preprocess (truediv 127.5, subtract 1), so feed raw pixels.
        pre = tf.image.resizeBilinear(tfrn.decodeJpeg(bytes, 3).toFloat(), [
          LOCAL_INPUT_SIZE,
          LOCAL_INPUT_SIZE,
        ]);
        batched = pre!.expandDims(0);
        logits = (await model.predict(batched)) as import("@tensorflow/tfjs").Tensor;
        const probs = Array.from(await logits.data());
        const indexed = labels.map((name, index) => ({
          name,
          confidence: probs[index] ?? 0,
        }));
        indexed.sort((a, b) => b.confidence - a.confidence);
        const top: FoodCandidate[] = indexed
          .filter((item) => item.confidence >= LOCAL_MIN_CONFIDENCE)
          .slice(0, LOCAL_TOP_K)
          .map((item) => ({
            name: item.name,
            task: "food_classification",
            confidence: item.confidence,
          }));
        if (top.length === 0) {
          return {
            request_id: buildRequestId(),
            model_revision: LOCAL_MODEL_REVISION,
            candidate_status: "abstained",
            candidates: [],
            confidence: null,
            abstention_reason: "Low on-device confidence for this photo.",
            is_mock: false,
          };
        }
        return {
          request_id: buildRequestId(),
          model_revision: LOCAL_MODEL_REVISION,
          candidate_status: "candidate",
          candidates: top,
          confidence: top[0].confidence,
          abstention_reason: null,
          is_mock: false,
        };
      } finally {
        pre?.dispose();
        batched?.dispose();
        logits?.dispose();
      }
    };

    return { runner };
  } catch {
    return null;
  }
}
