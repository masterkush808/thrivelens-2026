import * as Crypto from "expo-crypto";
import { addFoodLog } from "@/data/foodRepository";
import type { FoodLog } from "@/db";
// Platform-split: resolves to local-classifier.native.ts on ios/android and
// local-classifier.web.ts on web, so @tensorflow/tfjs never enters the browser
// bundle. See local-classifier.web.ts for why that is mandatory.
import { classifyLocally } from "./local-classifier";

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

export function buildRequestId(): string {
  return Crypto.randomUUID();
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
   * On web `classifyLocally` resolves to a stub returning null, because
   * @tensorflow/tfjs cannot initialise in a browser without cross-origin
   * isolation. Web therefore relies on the ZeroGPU Space.
   */
  const tryLocalClassifier = async (): Promise<AnalyzeResult | null> => {
    try {
      return await classifyLocally(uri);
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
        const localResult = await tryLocalClassifier();
        if (localResult) {
          result = localResult;
          source = "local";
        } else {
          console.warn(
            "[thrivelens] detectFood: all analysis paths failed",
            (cloudError as InferenceError).code,
          );
          throw cloudError as InferenceError;
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
