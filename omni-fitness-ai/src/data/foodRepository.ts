import * as Crypto from "expo-crypto";
import { currentUserId } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";
import { enqueueOperation } from "@/db/outbox";
import { FoodLog, foodLogsSince, insertFoodLog, recentFoodLogs } from "@/db";

export interface AddFoodInput {
  mealType: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  imageUri?: string | null;
  amountGrams?: number | null;
  aiConfidence?: number | null;
  aiModelVersion?: string | null;
  nutrientSource?: string | null;
}

export type FoodSummary = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export async function addFoodLog(input: AddFoodInput): Promise<FoodLog> {
  const userId = await currentUserId();
  if (!userId) throw new Error("You must be signed in to log food.");
  const now = Date.now();
  const id = Crypto.randomUUID();

  const log = await insertFoodLog({
    id,
    userId,
    date: now,
    mealType: input.mealType,
    foodName: input.foodName,
    calories: Math.round(input.calories),
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    fiber: input.fiber ?? null,
    imageUri: input.imageUri ?? null,
    amountGrams: input.amountGrams ?? null,
    aiConfidence: input.aiConfidence ?? null,
    aiModelVersion: input.aiModelVersion ?? null,
    nutrientSource: input.nutrientSource ?? null,
    createdAt: now,
  });

  if (supabaseConfigured) {
    await enqueueOperation({
      operationId: `${userId}:food_logs:${id}`,
      userId,
      entity: "food_logs",
      operation: "upsert",
      payload: {
        id,
        user_id: userId,
        logged_at: new Date(now).toISOString(),
        meal_type: input.mealType,
        food_name: input.foodName,
        calories: Math.round(input.calories),
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
        fiber: input.fiber ?? null,
        image_uri: input.imageUri ?? null,
        ai_confidence: input.aiConfidence ?? null,
        ai_model_version: input.aiModelVersion ?? null,
        created_at: new Date(now).toISOString(),
      },
    });
  }

  return log;
}

export async function getTodayFoodSummary(): Promise<FoodSummary> {
  const userId = await currentUserId();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const logs = await foodLogsSince(start.getTime(), 1000, userId ?? undefined);
  return logs.reduce<FoodSummary>(
    (summary, log) => ({
      calories: summary.calories + log.calories,
      protein: summary.protein + log.protein,
      carbs: summary.carbs + log.carbs,
      fat: summary.fat + log.fat,
      fiber: summary.fiber + (log.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

export async function getTodayFoodLogs(): Promise<FoodLog[]> {
  const userId = await currentUserId();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return foodLogsSince(start.getTime(), 1000, userId ?? undefined);
}

export async function getRecentFoodLogs(limit: number = 10): Promise<FoodLog[]> {
  const userId = await currentUserId();
  return recentFoodLogs(limit, userId ?? undefined);
}

/**
 * All food logs since `epochMs`, for charting a multi-day window.
 *
 * The calorie chart on Tracking used to be built from `getTodayFoodLogs()`,
 * whose result set can only ever contain entries from the current day. Every
 * filter (7D/30D/3M/6M) therefore rendered exactly one bar with data no matter
 * how much history existed.
 */
export async function getFoodLogsSince(epochMs: number): Promise<FoodLog[]> {
  const userId = await currentUserId();
  return foodLogsSince(epochMs, 5000, userId ?? undefined);
}