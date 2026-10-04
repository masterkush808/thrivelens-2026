import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import { addFoodLog } from "@/data/foodRepository";
import type { FoodLog } from "@/db";

import {
  AnalyzeResult,
  analyzeImage,
  analyzeImageZeroGPU,
  FoodCandidate,
  InferenceError,
  InferenceSource,
  isZeroGPUConfigured,
  lookupNutrition,
  NutritionResult,
} from "@/services/inference";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const ESTIMATE_DISCLAIMER =
  "Estimated values. A photo does not establish exact portion mass or hidden " +
  "ingredients. Nutrition values are matched to a verified food data after " +
  "confirmation and may be approximate.";

export interface AnalysisOutcome {
  requestId: string;
  modelRevision: string;
  candidateStatus: AnalyzeResult["candidate_status"];
  candidates: FoodCandidate[];
  confidence: number | null;
  abstentionReason: string | null;
  isMock: boolean;
  source: InferenceSource;
}

export interface ConfirmFoodInput {
  foodName: string;
  amountGrams: number;
  mealType: MealType;
  candidateConfidence?: number | null;
  aiModelVersion?: string | null;
  requestId: string;
  imageUri?: string | null;
}

export interface ConfirmedFood {
  food: NonNullable<NutritionResult["food"]>;
  confirmed: NonNullable<NutritionResult["confirmed"]>;
  log: FoodLog;
}

export const LOCAL_MODEL_REVISION = "tfjs/mobilenetv2";
const LOCAL_INPUT_SIZE = 160;
const LOCAL_TOP_K = 5;
const LOCAL_MIN_CONFIDENCE = 0.08;

export function buildRequestId(): string {
  return Crypto.randomUUID();
}

function localClassifierUnavailable(): InferenceError {
  return {
    code: "unavailable",
    message: "Could not analyze the photo. Please check your connection and try again.",
  };
}

interface LocalClassifier {
  runner(uri: string): Promise<AnalyzeResult>;
}

let localModelPromise: Promise<LocalClassifier | null> | null = null;

async function loadLocalClassifier(): Promise<LocalClassifier | null> {
  try {
    // Dynamic import keeps TF.js out of the initial bundle; it is only pulled
    // in when the on-device fallback classifier is first needed.
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

    const runner: LocalClassifier["runner"] = async (uri: string) => {
let pre: import("@tensorflow/tfjs").Tensor | null = null;
      let batched: import("@tensorflow/tfjs").Tensor | null = null;
      let logits: import("@tensorflow/tfjs").Tensor | null = null;
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
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
        const top = indexed
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

async function localClassify(uri: string): Promise<AnalyzeResult> {
  if (!localModelPromise) {
    localModelPromise = loadLocalClassifier();
  }
  const classifier = await localModelPromise;
  if (!classifier) {
    throw localClassifierUnavailable();
  }
  return classifier.runner(uri);
}

export async function detectFood(uri: string): Promise<AnalysisOutcome> {
  let result: AnalyzeResult;
  let source: InferenceSource = "cloud";

  const tryZeroGPU = async (): Promise<AnalyzeResult> => {
    console.log("[thrivelens] detectFood: cloud analysis started");
    const zresult = await analyzeImageZeroGPU(uri);
    console.log("[thrivelens] detectFood: cloud analysis ok");
    return {
      request_id: buildRequestId(),
      model_revision: zresult.model_revision,
      candidate_status: zresult.candidate_status,
      candidates: zresult.candidates,
      confidence: zresult.confidence,
      abstention_reason: zresult.abstention_reason,
      is_mock: zresult.is_mock,
    };
  };

  const tryLAN = async (): Promise<AnalyzeResult> => {
    console.log("[thrivelens] detectFood: fallback service started");
    const cloud = await analyzeImage(uri);
    console.log("[thrivelens] detectFood: fallback service ok");
    return cloud;
  };

  /**
   * On-device fallback. Returns null instead of throwing when it is not usable,
   * so callers can fall through to their own error.
   *
   * The classifier uses @tensorflow/tfjs-react-native's bundleResourceIO and
   * decodeJpeg, which are native modules with no web implementation. On web the
   * attempt would pull a large TFJS bundle only to fail, so it is skipped.
   */
  const tryLocalClassifier = async (): Promise<AnalyzeResult | null> => {
    if (Platform.OS === "web") return null;
    try {
      return await localClassify(uri);
    } catch (error) {
      console.warn("[thrivelens] detectFood: local classifier failed", String(error));
      return null;
    }
  };

  if (isZeroGPUConfigured()) {
    try {
      result = await tryZeroGPU();
      source = "zerogpu";
    } catch (error) {
      const inferenceError = error as InferenceError;
      console.warn("[thrivelens] detectFood: cloud analysis failed", inferenceError.code);
      try {
        result = await tryLAN();
        source = "cloud";
      } catch (cloudError) {
        try {
          result = await localClassify(uri);
          source = "local";
        } catch (localError) {
          console.warn(
            "[thrivelens] detectFood: all analysis paths failed",
            (cloudError as InferenceError).code,
            (localError as InferenceError).code,
          );
          throw localError as InferenceError;
        }
      }
    }
  } else {
    try {
      result = await tryLAN();
      source = "cloud";
    } catch (cloudError) {
      // Previously this branch simply rethrew, so the on-device classifier was
      // only ever reachable when ZeroGPU was configured. With no inference
      // backend configured at all (the default), photo analysis failed outright
      // even though a bundled MobileNetV2 model was available as a fallback.
      const localResult = await tryLocalClassifier();
      if (localResult) {
        result = localResult;
        source = "local";
      } else {
        throw cloudError as InferenceError;
      }
    }
  }
  const candidates = result.candidates.map((candidate) => ({
    ...candidate,
    name: candidate.name.trim(),
  }));
  return {
    requestId: result.request_id,
    modelRevision: result.model_revision,
    candidateStatus: result.candidate_status,
    candidates,
    confidence: result.confidence,
    abstentionReason: result.abstention_reason,
    isMock: result.is_mock,
    source,
  };
}

export interface BarcodeLogInput {
  foodName: string;
  barcode: string;
  per100g: {
    energyKcal: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number | null;
  };
  missingFields: string[];
  amountGrams: number;
  mealType: MealType;
}

export async function confirmBarcodeAndLog(input: BarcodeLogInput): Promise<FoodLog> {
  const factor = input.amountGrams / 100;
  const log: FoodLog = await addFoodLog({
    mealType: input.mealType,
    foodName: input.foodName,
    calories: Math.round(input.per100g.energyKcal * factor),
    protein: input.per100g.protein * factor,
    carbs: input.per100g.carbs * factor,
    fat: input.per100g.fat * factor,
    fiber: input.per100g.fiber != null ? input.per100g.fiber * factor : null,
    imageUri: null,
    amountGrams: input.amountGrams,
    aiConfidence: null,
    aiModelVersion: null,
    nutrientSource: `Open Food Facts (${input.barcode})`,
  });
  return log;
}

export async function confirmAndLog(input: ConfirmFoodInput): Promise<ConfirmedFood> {
  const nutrition = await lookupNutrition({
    request_id: input.requestId,
    food_name: input.foodName,
    amount_g: input.amountGrams,
  });
  if (nutrition.candidate_status === "abstained" || !nutrition.food || !nutrition.confirmed) {
    const error: InferenceError = {
      code: "http",
      message: "We couldn't find matching nutrition information for this food.",
    };
    throw error;
  }
  const log: FoodLog = await addFoodLog({
    mealType: input.mealType,
    foodName: nutrition.food.food_name,
    calories: Math.round(nutrition.confirmed.energy_kcal),
    protein: nutrition.confirmed.protein_g,
    carbs: nutrition.confirmed.carbs_g,
    fat: nutrition.confirmed.fat_g,
    fiber: nutrition.confirmed.fiber_g,
    imageUri: input.imageUri ?? null,
    amountGrams: nutrition.confirmed.amount_g,
    aiConfidence: input.candidateConfidence ?? null,
    aiModelVersion: input.aiModelVersion ?? null,
    nutrientSource: nutrition.food.source,
  });
  return { food: nutrition.food, confirmed: nutrition.confirmed, log };
}