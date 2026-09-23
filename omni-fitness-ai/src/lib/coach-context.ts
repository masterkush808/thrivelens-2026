import * as Location from "expo-location";
import { eq } from "drizzle-orm";

import {
  CoachContext,
  FridgeItem,
  LocationContext,
  LocationPermission,
  makeRequestId,
  MealPlanSummary,
  MealSlot,
  PlanDay,
  RecentFoodLog,
  ScheduleSummary,
  WorkoutPlanSummary,
} from "@/services/inference";
import { getCoachProfile } from "@/lib/coach-profile";
import { getCurrentProfile } from "@/data/profileRepository";
import { buildAdherenceSnapshot } from "@/data/adherenceRepo";
import {
  activeMealPlan,
  db,
  fridgeItemsForUser,
  recentFoodLogs,
  schedulesForUser,
} from "@/db";
import { workoutPlans } from "@/db/schema";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function localOffset(date: Date): string {
  const offsetMs = -date.getTimezoneOffset() * 60_000;
  const sign = offsetMs >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMs);
  const hh = pad(Math.floor(abs / 3_600_000));
  const mm = pad(Math.floor((abs % 3_600_000) / 60_000));
  return `${sign}${hh}:${mm}`;
}

function localIsoString(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    localOffset(date)
  );
}

function localDateString(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toRecentFoodLog(log: {
  date: number;
  mealType: string;
  foodName: string;
  calories: number;
  amountGrams?: number | null;
  aiConfidence?: number | null;
  aiModelVersion?: string | null;
  nutrientSource?: string | null;
}): RecentFoodLog {
  return {
    date: localDateString(new Date(log.date)),
    meal_type: log.mealType,
    food_name: log.foodName,
    amount_g: log.amountGrams ?? null,
    energy_kcal: log.calories,
    ai_model_version: log.aiModelVersion ?? null,
    ai_confidence: log.aiConfidence ?? null,
    nutrient_source: log.nutrientSource ?? null,
  };
}

function toFridgeItem(item: {
  name: string;
  category?: string | null;
  quantity?: number | null;
  unit?: string | null;
  addedDate: string;
  expiryDate?: string | null;
}): FridgeItem {
  return {
    name: item.name,
    category: item.category ?? null,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    added_date: item.addedDate,
    expiry_date: item.expiryDate ?? null,
  };
}

function isValidMealSlot(meal: unknown): meal is MealSlot {
  if (typeof meal !== "object" || meal === null) return false;
  const m = meal as { meal_type?: unknown; food_name?: unknown; amount_g?: unknown; note?: unknown };
  const mealType = m.meal_type;
  return (
    (mealType === "breakfast" || mealType === "lunch" || mealType === "dinner" || mealType === "snack") &&
    typeof m.food_name === "string" &&
    m.food_name.trim().length > 0 &&
    typeof m.amount_g === "number" &&
    m.amount_g > 0 &&
    (m.note === undefined || m.note === null || typeof m.note === "string")
  );
}

function isValidPlanDay(day: unknown): day is PlanDay {
  if (typeof day !== "object" || day === null) return false;
  const d = day as { day?: unknown; meals?: unknown };
  if (typeof d.day !== "number" || d.day < 0 || d.day > 6) return false;
  return Array.isArray(d.meals) && d.meals.every(isValidMealSlot);
}

function parseMealPlanSummary(plan: {
  id?: string;
  weekStart: string;
  planJson: string;
  groceryListJson: string;
  createdAt: string;
}): MealPlanSummary | null {
  try {
    const parsed = JSON.parse(plan.planJson) as {
      days?: unknown;
    };
    const days = Array.isArray(parsed.days) ? parsed.days : [];
    const groceryRaw = JSON.parse(plan.groceryListJson);
    const shoppingList = Array.isArray(groceryRaw)
      ? groceryRaw.filter((entry): entry is string => typeof entry === "string")
      : [];
    return {
      id: plan.id ?? null,
      week_start: plan.weekStart,
      goals: [],
      days: days.filter(isValidPlanDay),
      shopping_list: shoppingList,
      created_at: plan.createdAt,
    };
  } catch {
    return null;
  }
}

function parseScheduleStatus(value: string): "scheduled" | "completed" | "cancelled" {
  if (value === "completed" || value === "cancelled") return value;
  return "scheduled";
}

async function buildLocationContext(): Promise<LocationContext | null> {
  try {
    const permissions = await Location.getForegroundPermissionsAsync();
    let permission: LocationPermission = "unavailable";
    if (permissions?.status) {
      permission =
        permissions.status === Location.PermissionStatus.GRANTED
          ? "granted"
          : permissions.status === Location.PermissionStatus.DENIED
            ? "denied"
            : "not_determined";
    }
    if (permission !== "granted") {
      return { permission };
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      permission,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy_m: position.coords.accuracy ?? null,
      timestamp: position.timestamp ? new Date(position.timestamp).toISOString() : null,
    };
  } catch {
    return { permission: "unavailable" };
  }
}

export async function buildCoachContext(userId: string): Promise<CoachContext> {
  const now = new Date();
  const [profile, current, foodLogs, fridge, latestPlan, schedules, adherence, locationContext] =
    await Promise.all([
      getCoachProfile(),
      getCurrentProfile().catch(() => null),
      recentFoodLogs(15, userId),
      fridgeItemsForUser(userId),
      activeMealPlan(userId),
      schedulesForUser(userId),
      buildAdherenceSnapshot(userId),
      buildLocationContext(),
    ]);

  let workoutPlan: WorkoutPlanSummary | null = null;
  try {
    const rows = await db
      .select()
      .from(workoutPlans)
      .where(eq(workoutPlans.userId, userId))
      .limit(1);
    const active = rows[0] ?? null;
    if (active) {
      workoutPlan = {
        id: active.id,
        name: active.name,
        focus: active.goal ?? null,
        days_per_week: active.daysPerWeek,
        note: active.description ?? null,
        created_at: active.createdAt,
      };
    }
  } catch {
    workoutPlan = null;
  }

  const mealPlans = latestPlan
    ? parseMealPlanSummary(latestPlan)
    : null;

  return {
    request_id: makeRequestId(),
    profile: profile
      ? {
          ...profile,
          dietary_preference: current?.dietary_preference ?? profile.dietary_preference ?? null,
        }
      : null,
    goal_timeline: current?.goal_timeline ?? null,
    dietary_restrictions: [],
    recent_food_logs: foodLogs.map(toRecentFoodLog),
    fridge_items: fridge.map(toFridgeItem),
    active_meal_plan: mealPlans?.week_start ?? null,
    active_workout_plan: workoutPlan?.name ?? null,
    meal_plans: mealPlans ? [mealPlans] : [],
    workout_plan: workoutPlan,
    schedules: schedules
      .filter((entry) => entry.kind === "workout" || entry.kind === "meal_prep")
      .map<ScheduleSummary>((entry) => ({
        id: entry.id,
        kind: entry.kind as "workout" | "meal_prep",
        title: entry.title,
        scheduled_for: entry.scheduledFor,
        status: parseScheduleStatus(entry.status),
      })),
    adherence,
    now_iso: localIsoString(now),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    location: locationContext,
  };
}