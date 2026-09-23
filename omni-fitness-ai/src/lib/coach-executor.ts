import * as Crypto from "expo-crypto";

import {
  activeMealPlan,
  fridgeItemsForUser,
  insertCheatDay,
  insertFridgeItems,
  insertSchedules,
  latestCheatDay,
  schedulesForUser,
  upsertMealPlan,
} from "@/db";
import { getRecentFoodLogs, addFoodLog } from "@/data/foodRepository";
import { getCurrentProfile, updateCurrentProfile } from "@/data/profileRepository";
import { confirmAndLog } from "@/lib/food-recognition";
import {
  CoachAction,
  CoachActionExecution,
  Citation,
  ExecutionStatus,
  NavigateScreen,
  PlaceCategory,
} from "@/services/inference";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealType = (typeof MEAL_TYPES)[number];

interface Handle {
  refs: Citation[];
  message: string;
  status: ExecutionStatus;
}

function finish(action: CoachAction, handle: Handle): CoachActionExecution {
  return {
    execution_id: Crypto.randomUUID(),
    action_type: action.type,
    status: handle.status,
    message: handle.message,
    refs: handle.refs,
    occurred_at: new Date().toISOString(),
  };
}

function ok(action: CoachAction, message: string, refs: Citation[] = []): CoachActionExecution {
  return finish(action, { message, refs, status: "completed" });
}

function cancelled(action: CoachAction, message: string): CoachActionExecution {
  return finish(action, { message, refs: [], status: "cancelled" });
}

function failed(action: CoachAction, message: string): CoachActionExecution {
  return finish(action, { message, refs: [], status: "failed" });
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function localDateString(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function weekStartFor(date: Date = new Date()): string {
  const copy = new Date(date);
  const dayIndex = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - dayIndex);
  return localDateString(copy);
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function cheatUsedThisMonth(lastDate: string | null, now: Date): boolean {
  if (!lastDate) return false;
  return lastDate.slice(0, 7) === localDateString(now).slice(0, 7);
}

function isMealType(value: unknown): value is MealType {
  return typeof value === "string" && (MEAL_TYPES as readonly string[]).includes(value);
}

function isPlaceCategory(value: unknown): value is PlaceCategory {
  return (
    typeof value === "string" &&
    (["gym", "grocery", "restaurant", "pharmacy"] as string[]).includes(value)
  );
}

function isReportedDay(day: unknown): boolean {
  return (
    typeof day === "object" &&
    day !== null &&
    typeof (day as { day?: unknown }).day === "number" &&
    Array.isArray((day as { meals?: unknown }).meals)
  );
}

async function logMeal(action: CoachAction, userId: string): Promise<CoachActionExecution> {
  const payload = action.payload as { food_name: string; amount_g: number; meal_type: string; date?: string | null };
  if (!isMealType(payload.meal_type)) {
    return failed(action, "Couldn't log that meal: missing meal type.");
  }

  const recent = await getRecentFoodLogs(15);
  const today = localDateString();
  const duplicate = recent.some(
    (log) =>
      log.mealType === payload.meal_type &&
      normalizeName(log.foodName) === normalizeName(payload.food_name) &&
      localDateString(new Date(log.date)) === today,
  );
  if (duplicate) {
    return ok(
      action,
      `${payload.food_name} is already logged for ${payload.meal_type} today — skipped the duplicate.`,
      [{ type: "food_log", label: "Skipped duplicate", value: payload.food_name }],
    );
  }

  let log;
  try {
    const confirmed = await confirmAndLog({
      foodName: payload.food_name,
      amountGrams: payload.amount_g,
      mealType: payload.meal_type,
      requestId: Crypto.randomUUID(),
    });
    log = confirmed.log;
  } catch {
    log = await addFoodLog({
      mealType: payload.meal_type,
      foodName: payload.food_name,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      amountGrams: payload.amount_g,
      nutrientSource: "coach.simple",
    });
  }
  const macrosAvailable = (log.calories ?? 0) > 0;
  return ok(
    action,
    macrosAvailable
      ? `Logged ${payload.amount_g} g of ${log.foodName} for ${payload.meal_type}.`
      : `Logged ${payload.amount_g} g of ${log.foodName} for ${payload.meal_type} (nutrition values unavailable, scaled as 0 g macros until verified).`,
    [
      {
        type: "food_log",
        label: "Meal logged",
        value: `${log.foodName} · ${payload.amount_g} g · ${log.mealType}`,
      },
    ],
  );
}

async function scheduleMealPlan(
  action: CoachAction,
  userId: string,
  onNavigate?: (screen: NavigateScreen, params?: { category?: PlaceCategory; query?: string; params?: Record<string, string> }) => void,
): Promise<CoachActionExecution> {
  const payload = action.payload as {
    goal?: string | null;
    week_start?: string | null;
    days?: unknown;
    shopping_list?: unknown;
  };
  const days = Array.isArray(payload.days) ? payload.days : [];
  if (!days.every(isReportedDay)) {
    return failed(action, "The proposed meal plan came back incomplete and wasn't saved.");
  }
  const weekStart = payload.week_start ?? weekStartFor();

  const existing = await activeMealPlan(userId);
  if (existing && existing.weekStart === weekStart) {
    onNavigate?.("meal-plans");
    return ok(
      action,
      `A meal plan for the week of ${weekStart} already exists — kept it instead of overwriting.`,
      [{ type: "policy", label: "Existing plan kept", value: weekStart }],
    );
  }

  const planJson = JSON.stringify({
    goal: payload.goal ?? null,
    week_start: weekStart,
    days: days.filter(isReportedDay),
    shopping_list: Array.isArray(payload.shopping_list) ? payload.shopping_list : [],
  });
  const shoppingListJson = JSON.stringify(
    Array.isArray(payload.shopping_list) ? payload.shopping_list : [],
  );
  const now = new Date().toISOString();

  await upsertMealPlan({
    id: Crypto.randomUUID(),
    userId,
    weekStart,
    goal: payload.goal ?? null,
    planJson,
    groceryListJson: shoppingListJson,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  const mealCount = days
    .map((day) => ((day as { meals?: unknown[] }).meals ?? []).length)
    .reduce((a, b) => a + b, 0);
  onNavigate?.("meal-plans");
  return ok(
    action,
    `Saved your meal plan for the week of ${weekStart} (${mealCount} meals across ${days.length} days${payload.goal ? ` · ${payload.goal}` : ""}).`,
    [{ type: "profile", label: "Meal plan week", value: weekStart }],
  );
}

async function scheduleMealPrep(action: CoachAction, userId: string): Promise<CoachActionExecution> {
  const payload = action.payload as {
    goal?: string | null;
    week_start?: string | null;
    sessions?: { date: string; session_title: string; tasks?: string[] }[];
  };
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  if (sessions.length === 0) {
    return cancelled(action, "No meal-prep sessions to schedule.");
  }

  const existingRows = await schedulesForUser(userId);
  const plannedKeys = new Set(
    existingRows
      .filter((row) => row.kind === "meal_prep" && row.status === "scheduled")
      .map((row) => `${row.scheduledFor}:${normalizeName(row.title)}`),
  );
  const freshSessions = sessions.filter(
    (session) => !plannedKeys.has(`${session.date}:${normalizeName(session.session_title)}`),
  );
  if (freshSessions.length === 0) {
    return ok(
      action,
      "Meal-prep sessions for this week are already scheduled — nothing new was added.",
      [{ type: "policy", label: "No-op", value: "Meal prep already planned" }],
    );
  }

  const now = new Date().toISOString();
  for (const session of freshSessions) {
    await insertSchedules([
      {
        id: Crypto.randomUUID(),
        userId,
        planId: null,
        kind: "meal_prep",
        title: session.session_title,
        scheduledFor: session.date,
        detailJson: JSON.stringify({ tasks: session.tasks ?? [] }),
        status: "scheduled",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }

  return ok(
    action,
    `Scheduled ${freshSessions.length} meal-prep session${freshSessions.length === 1 ? "" : "s"}.`,
    freshSessions.map((session) => ({
      type: "profile" as const,
      label: "Meal prep",
      value: `${session.date} · ${session.session_title}`,
    })),
  );
}

async function scheduleWorkout(
  action: CoachAction,
  userId: string,
  onNavigate?: (screen: NavigateScreen, params?: { category?: PlaceCategory; query?: string; params?: Record<string, string> }) => void,
): Promise<CoachActionExecution> {
  const payload = action.payload as {
    days_per_week?: number | null;
    focus?: string | null;
    note?: string | null;
    start_date?: string | null;
  };
  const daysPerWeek = Math.max(1, Math.min(7, payload.days_per_week ?? 4));
  const startDate = payload.start_date ?? weekStartFor();
  const weekEnd = addDays(startDate, 6);

  const existingRows = await schedulesForUser(userId);
  const hasSameWeek = existingRows.some(
    (row) =>
      row.kind === "workout" &&
      row.status === "scheduled" &&
      row.scheduledFor >= startDate &&
      row.scheduledFor <= weekEnd,
  );
  if (hasSameWeek) {
    onNavigate?.("workout");
    return ok(
      action,
      `Workout sessions for the week of ${startDate} are already scheduled — kept them as-is.`,
      [{ type: "policy", label: "Existing week kept", value: startDate }],
    );
  }

  const now = new Date().toISOString();
  const sessions = [];
  for (let i = 0; i < daysPerWeek; i += 1) {
    const on = addDays(startDate, i);
    sessions.push({
      id: Crypto.randomUUID(),
      userId,
      planId: null,
      kind: "workout",
      title: payload.focus ? `Workout · ${payload.focus}` : "Workout",
      scheduledFor: on,
      detailJson: JSON.stringify({ focus: payload.focus ?? null }),
      status: "scheduled",
      createdAt: now,
      updatedAt: now,
    });
  }
  if (sessions.length === 0) {
    return cancelled(action, "The proposed workout dates fall outside this week — nothing scheduled.");
  }
  for (const session of sessions) {
    await insertSchedules([session]);
  }

  onNavigate?.("workout");
  return ok(
    action,
    `Scheduled ${sessions.length} workout session${sessions.length === 1 ? "" : "s"} from ${sessions[0].scheduledFor}${payload.focus ? ` (${payload.focus})` : ""}.`,
    sessions.map((session) => ({
      type: "profile" as const,
      label: "Workout",
      value: `${session.scheduledFor} · ${session.title}`,
    })),
  );
}

async function addFridgeItems(
  action: CoachAction,
  userId: string,
  onNavigate?: (screen: NavigateScreen, params?: { category?: PlaceCategory; query?: string; params?: Record<string, string> }) => void,
): Promise<CoachActionExecution> {
  const payload = action.payload as {
    items?: { name: string; category?: string | null; quantity?: number | null; unit?: string | null }[];
  };
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    return cancelled(action, "No fridge items were provided to add.");
  }

  const fridge = await fridgeItemsForUser(userId);
  const existingNames = new Map(
    fridge.map((item) => [normalizeName(item.name), item.quantity ?? null]),
  );
  const toAdd = items.filter((item) => !existingNames.has(normalizeName(item.name)));
  const skipped = items.filter((item) => existingNames.has(normalizeName(item.name)));

  if (toAdd.length === 0) {
    const names = skipped.map((item) => item.name).join(", ");
    onNavigate?.("fridge");
    return ok(
      action,
      `Already in your fridge (nothing added): ${names}.`,
      skipped.map((item) => ({ type: "profile", label: "Already in fridge", value: item.name })),
    );
  }

  const now = new Date().toISOString();
  for (const item of toAdd) {
    await insertFridgeItems([
      {
        id: Crypto.randomUUID(),
        userId,
        name: item.name.trim(),
        category: item.category ?? null,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        addedDate: localDateString(),
        expiryDate: null,
        used: false,
        createdAt: now,
      },
    ]);
  }
  if (skipped.length > 0) {
    onNavigate?.("fridge");
    return ok(
      action,
      `Added ${toAdd.length} item${toAdd.length === 1 ? "" : "s"} to your fridge. Skip${skipped.length === 1 ? "s" : ""} duplicate${skipped.length === 1 ? "" : "s"}: ${skipped.map((item) => item.name).join(", ")}.`,
      toAdd.map((item) => ({ type: "profile", label: "Added to fridge", value: item.name })),
    );
  }
  onNavigate?.("fridge");
  return ok(
    action,
    `Added ${toAdd.length} item${toAdd.length === 1 ? "" : "s"} to your fridge.`,
    toAdd.map((item) => ({ type: "profile", label: "Added to fridge", value: item.name })),
  );
}

async function setGoal(action: CoachAction, userId: string): Promise<CoachActionExecution> {
  const payload = action.payload as { goal: string; timeline?: string | null };
  let existingTimeline: string | null = null;
  try {
    const profile = await getCurrentProfile();
    existingTimeline = profile.goal_timeline ?? null;
  } catch {
    existingTimeline = null;
  }
  await updateCurrentProfile({ goal: payload.goal, goal_timeline: payload.timeline ?? existingTimeline });

  return ok(
    action,
    payload.timeline
      ? `Goal set: ${payload.goal}, aiming for ${payload.timeline}.`
      : `Goal set: ${payload.goal}.`,
    [
      { type: "profile", label: "Goal", value: payload.goal },
      ...(payload.timeline ? [{ type: "profile" as const, label: "Timeline", value: payload.timeline }] : []),
    ],
  );
}

async function suggestGroceries(action: CoachAction, _userId: string): Promise<CoachActionExecution> {
  const payload = action.payload as { items?: { name: string; reason?: string | null }[] };
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    return cancelled(action, "No grocery suggestions were produced.");
  }
  return ok(
    action,
    `${items.length} grocery suggestion${items.length === 1 ? "" : "s"} — see the checklist below.`,
    items.map((item) => ({
      type: "policy",
      label: "Grocery",
      value: item.reason ? `${item.name} (${item.reason})` : item.name,
    })),
  );
}

async function cheatDay(action: CoachAction, userId: string): Promise<CoachActionExecution> {
  const payload = action.payload as { eligible: boolean; reason?: string | null };
  const lastCheat = await latestCheatDay(userId);
  const now = new Date();
  if (!payload.eligible || cheatUsedThisMonth(lastCheat?.date ?? null, now)) {
    return cancelled(
      action,
      payload.reason && !payload.eligible
        ? payload.reason
        : "You've already used your cheat day this month — track consistently and it renews next month.",
    );
  }
  await insertCheatDay({
    id: Crypto.randomUUID(),
    userId,
    date: localDateString(now),
    reason: payload.reason ?? null,
    createdAt: new Date(now).toISOString(),
  });
  return ok(
    action,
    "Cheat day recorded for today — enjoy it, and get back on plan tomorrow.",
    [{ type: "policy", label: "Cheat day", value: localDateString(now) }],
  );
}

function navigate(action: CoachAction, target: {
  screen: string;
  category?: unknown;
  query?: unknown;
}): CoachActionExecution {
  const label =
    target.screen === "maps"
      ? isPlaceCategory(target.category)
        ? target.category
        : target.screen
      : target.screen;
  return ok(
    action,
    `Opening ${label}${isNonEmpty(target.query) ? ` for “${target.query}”` : ""}…`,
    [],
  );
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function executeCoachAction(input: {
  action: CoachAction;
  userId: string;
  onNavigate?: (screen: NavigateScreen, params?: { category?: PlaceCategory; query?: string; params?: Record<string, string> }) => void;
}): Promise<CoachActionExecution> {
  const { action, userId } = input;
  const navigatePayload = (() => {
    if (action.type === "navigate") {
      return action.payload;
    }
    if (action.type === "find_places") {
      const p = action.payload;
      return {
        screen: "maps" as const,
        category: isPlaceCategory(p.category) ? p.category : undefined,
        query: isNonEmpty(p.query) ? p.query : undefined,
      };
    }
    return null;
  })();

  try {
    switch (action.type) {
      case "log_meal":
        return await logMeal(action, userId);
      case "schedule_meal_plan":
        return await scheduleMealPlan(action, userId, input.onNavigate);
      case "schedule_meal_prep":
        return await scheduleMealPrep(action, userId);
      case "schedule_workout":
        return await scheduleWorkout(action, userId, input.onNavigate);
      case "add_fridge_items":
        return await addFridgeItems(action, userId, input.onNavigate);
      case "set_goal":
        return await setGoal(action, userId);
      case "suggest_groceries":
        return await suggestGroceries(action, userId);
      case "cheat_day":
        return await cheatDay(action, userId);
      case "navigate":
      case "find_places":
        if (navigatePayload) {
          const result = navigate(action, navigatePayload);
          if (input.onNavigate) {
            input.onNavigate(
              navigatePayload.screen as NavigateScreen,
              {
                category: isPlaceCategory(navigatePayload.category) ? navigatePayload.category : undefined,
                query: isNonEmpty(navigatePayload.query) ? navigatePayload.query : undefined,
                params: navigatePayload.params,
              },
            );
          }
          return result;
        }
        return failed(action, "Couldn't navigate: no destination provided.");
      default:
        return failed(action, "Unsupported action was not executed.");
    }
  } catch (error) {
    return failed(
      action,
      error instanceof Error ? `Couldn't complete that: ${error.message}` : "Couldn't complete that action.",
    );
  }
}