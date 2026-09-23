import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";

const BASE_URL = process.env.EXPO_PUBLIC_INFERENCE_URL;
const API_TOKEN = process.env.EXPO_PUBLIC_INFERENCE_TOKEN;
const ZEROGPU_URL = process.env.EXPO_PUBLIC_ZEROGPU_URL;
const HF_TOKEN = process.env.EXPO_PUBLIC_HF_TOKEN;

export type InferenceSource = "cloud" | "zerogpu" | "local";

export type CandidateStatus = "candidate" | "abstained";

export interface FoodCandidate {
  name: string;
  task: string;
  confidence: number;
  raw?: string;
}

export interface AnalyzeResult {
  request_id: string;
  model_revision: string;
  candidate_status: CandidateStatus;
  candidates: FoodCandidate[];
  confidence: number | null;
  abstention_reason: string | null;
  is_mock: boolean;
}

export interface MacroSnapshot {
  energy_kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number | null;
}

export interface NutritionBasis {
  food_name: string;
  matched_from: "catalogue" | "provider";
  source: string;
  basis: string;
  per_100g: MacroSnapshot;
  missing_fields: string[];
}

export interface ConfirmedPortion {
  amount_g: number;
  energy_kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number | null;
}

export interface NutritionResult {
  request_id: string;
  candidate_status: CandidateStatus;
  food: NutritionBasis | null;
  confirmed: ConfirmedPortion | null;
  deterministic: boolean;
  abstention_reason: string | null;
  is_mock: boolean;
}

export interface CoachProfile {
  height_cm?: number | null;
  weight_kg?: number | null;
  age?: number | null;
  gender?: string | null;
  goal?: string | null;
  activity_level?: string | null;
  dietary_preference?: string | null;
  dietary_restrictions?: string[];
}

export interface RecentFoodLog {
  date?: string | null;
  meal_type?: string | null;
  food_name: string;
  amount_g?: number | null;
  energy_kcal?: number | null;
  ai_model_version?: string | null;
  ai_confidence?: number | null;
  nutrient_source?: string | null;
}

export interface FridgeItem {
  name: string;
  category?: string | null;
  quantity?: number | null;
  unit?: string | null;
  added_date?: string | null;
  expiry_date?: string | null;
}

export interface AdherenceSnapshot {
  active_days_30: number;
  target_days_30: number;
  logged_workouts_30: number;
  streak_days: number;
  cheat_day_eligible: boolean;
  last_cheat_day?: string | null;
}

export type LocationPermission = "granted" | "denied" | "not_determined" | "unavailable";

export interface LocationContext {
  permission: LocationPermission;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_m?: number | null;
  timestamp?: string | null;
}

export interface MealSlot {
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  food_name: string;
  amount_g: number;
  note?: string | null;
}

export interface PlanDay {
  day: number;
  meals: MealSlot[];
}

export interface MealPlanSummary {
  id?: string | null;
  week_start: string;
  goals: string[];
  days: PlanDay[];
  shopping_list: string[];
  created_at?: string | null;
}

export interface WorkoutPlanSummary {
  id?: string | null;
  name: string;
  focus?: string | null;
  days_per_week?: number | null;
  note?: string | null;
  created_at?: string | null;
}

export interface ScheduleSummary {
  id?: string | null;
  kind: "workout" | "meal_prep";
  title: string;
  scheduled_for: string;
  status: "scheduled" | "completed" | "cancelled";
}

export interface CoachContext {
  request_id?: string;
  profile?: CoachProfile | null;
  goal_timeline?: string | null;
  dietary_restrictions?: string[];
  recent_food_logs?: RecentFoodLog[];
  fridge_items?: FridgeItem[];
  active_meal_plan?: string | null;
  active_workout_plan?: string | null;
  meal_plans?: MealPlanSummary[];
  workout_plan?: WorkoutPlanSummary | null;
  schedules?: ScheduleSummary[];
  adherence?: AdherenceSnapshot | null;
  now_iso?: string | null;
  timezone?: string | null;
  location?: LocationContext | null;
}

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Citation {
  type: "profile" | "food_log" | "catalogue" | "policy";
  label: string;
  value: string;
}

export interface LogMealPayload {
  food_name: string;
  amount_g: number;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  date?: string | null;
}

export type PlaceCategory = "gym" | "grocery" | "restaurant" | "pharmacy";

export interface FindPlacesPayload {
  category?: PlaceCategory | null;
  query?: string | null;
  open_now?: boolean | null;
}

export type NavigateScreen =
  | "options"
  | "home"
  | "scanner"
  | "barcode"
  | "tracking"
  | "nutrition"
  | "maps"
  | "workout"
  | "coach"
  | "profile"
  | "meal-plans"
  | "fridge"
  | "cheat-day";

export interface NavigatePayload {
  screen: NavigateScreen;
  category?: PlaceCategory | null;
  query?: string | null;
  params?: Record<string, string>;
}

export interface WorkoutPlanPayload {
  days_per_week?: number | null;
  focus?: string | null;
  note?: string | null;
  start_date?: string | null;
}

export interface WeeklyMealPlanPayload {
  goal?: string | null;
  week_start?: string | null;
  days: PlanDay[];
  shopping_list: string[];
}

export interface PrepSession {
  date: string;
  session_title: string;
  note?: string | null;
  tasks: string[];
}

export interface ScheduleMealPrepPayload {
  goal?: string | null;
  week_start?: string | null;
  sessions: PrepSession[];
}

export interface FridgeAddItem {
  name: string;
  category?: string | null;
  quantity?: number | null;
  unit?: string | null;
}

export interface AddFridgeItemsPayload {
  items: FridgeAddItem[];
}

export interface GrocerySuggestionItem {
  name: string;
  reason?: string | null;
}

export interface SuggestGroceriesPayload {
  items: GrocerySuggestionItem[];
}

export interface SetGoalPayload {
  goal: string;
  timeline?: string | null;
}

export interface CheatDayPayload {
  eligible: boolean;
  reason?: string | null;
}

export type CoachAction =
  | { type: "log_meal"; payload: LogMealPayload }
  | { type: "find_places"; payload: FindPlacesPayload }
  | { type: "navigate"; payload: NavigatePayload }
  | { type: "schedule_workout"; payload: WorkoutPlanPayload }
  | { type: "schedule_meal_plan"; payload: WeeklyMealPlanPayload }
  | { type: "schedule_meal_prep"; payload: ScheduleMealPrepPayload }
  | { type: "add_fridge_items"; payload: AddFridgeItemsPayload }
  | { type: "set_goal"; payload: SetGoalPayload }
  | { type: "suggest_groceries"; payload: SuggestGroceriesPayload }
  | { type: "cheat_day"; payload: CheatDayPayload };

/**
 * Execution-status contract mirroring the backend. `completed` is reported
 * only when every required sub-step of an action succeeded.
 */
export type ExecutionStatus =
  | "suggested"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export interface CoachActionExecution {
  execution_id: string;
  action_type: string;
  status: ExecutionStatus;
  message: string;
  refs: Citation[];
  occurred_at: string;
}

export const SUPPORTED_ACTION_TYPES = [
  "log_meal",
  "find_places",
  "navigate",
  "schedule_workout",
  "schedule_meal_plan",
  "schedule_meal_prep",
  "add_fridge_items",
  "set_goal",
  "suggest_groceries",
  "cheat_day",
] as const;

export type SupportedActionType = (typeof SUPPORTED_ACTION_TYPES)[number];

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const PLACE_CATEGORIES = ["gym", "grocery", "restaurant", "pharmacy"] as const;
const NAVIGATE_SCREENS: readonly string[] = [
  "options",
  "home",
  "scanner",
  "barcode",
  "tracking",
  "nutrition",
  "maps",
  "workout",
  "coach",
  "profile",
  "meal-plans",
  "fridge",
  "cheat-day",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Defensive mirror of the backend action registry. Unknown types, malformed
 * payloads, and payloads carrying undeclared fields never survive, so the app
 * never executes something the serving layer did not bless.
 */
export function parseCoachAction(raw: unknown): CoachAction | null {
  if (!isRecord(raw) || !isNonEmptyString(raw.type) || !isRecord(raw.payload)) {
    return null;
  }
  const type = raw.type as string;
  const payload = raw.payload;

  switch (type) {
    case "log_meal": {
      if (
        hasOnlyKeys(payload, ["food_name", "amount_g", "meal_type", "date"]) &&
        isNonEmptyString(payload.food_name) &&
        isFinitePositive(payload.amount_g) &&
        payload.amount_g <= 2000 &&
        MEAL_TYPES.includes(payload.meal_type as (typeof MEAL_TYPES)[number]) &&
        (payload.date === undefined || payload.date === null || typeof payload.date === "string")
      ) {
        return { type, payload: payload as unknown as LogMealPayload };
      }
      return null;
    }
    case "find_places": {
      if (
        hasOnlyKeys(payload, ["category", "query", "open_now"]) &&
        (payload.category === null ||
          payload.category === undefined ||
          PLACE_CATEGORIES.includes(payload.category as (typeof PLACE_CATEGORIES)[number])) &&
        (payload.query === null || payload.query === undefined || isNonEmptyString(payload.query)) &&
        (payload.open_now === null || payload.open_now === undefined || typeof payload.open_now === "boolean")
      ) {
        return { type, payload: payload as unknown as FindPlacesPayload };
      }
      return null;
    }
    case "navigate": {
      if (
        hasOnlyKeys(payload, ["screen", "category", "query", "params"]) &&
        typeof payload.screen === "string" &&
        NAVIGATE_SCREENS.includes(payload.screen) &&
        (payload.category === null ||
          payload.category === undefined ||
          PLACE_CATEGORIES.includes(payload.category as (typeof PLACE_CATEGORIES)[number])) &&
        (payload.query === null || payload.query === undefined || isNonEmptyString(payload.query)) &&
        (payload.params === undefined || (isRecord(payload.params) && Object.values(payload.params).every((v) => typeof v === "string")))
      ) {
        return { type, payload: payload as unknown as NavigatePayload };
      }
      return null;
    }
    case "schedule_workout": {
      if (
        hasOnlyKeys(payload, ["days_per_week", "focus", "note", "start_date"]) &&
        (payload.days_per_week === null ||
          payload.days_per_week === undefined ||
          (typeof payload.days_per_week === "number" &&
            payload.days_per_week >= 1 &&
            payload.days_per_week <= 7)) &&
        (payload.focus === null || payload.focus === undefined || isNonEmptyString(payload.focus)) &&
        (payload.note === null || payload.note === undefined || typeof payload.note === "string") &&
        (payload.start_date === null || payload.start_date === undefined || typeof payload.start_date === "string")
      ) {
        return { type, payload: payload as unknown as WorkoutPlanPayload };
      }
      return null;
    }
    case "schedule_meal_plan": {
      if (
        hasOnlyKeys(payload, ["goal", "week_start", "days", "shopping_list"]) &&
        Array.isArray(payload.days) &&
        Array.isArray(payload.shopping_list) &&
        (payload.goal === null || payload.goal === undefined || isNonEmptyString(payload.goal)) &&
        (payload.week_start === null || payload.week_start === undefined || typeof payload.week_start === "string")
      ) {
        return { type, payload: payload as unknown as WeeklyMealPlanPayload };
      }
      return null;
    }
    case "schedule_meal_prep": {
      if (
        hasOnlyKeys(payload, ["goal", "week_start", "sessions"]) &&
        Array.isArray(payload.sessions) &&
        payload.sessions.length <= 7 &&
        payload.sessions.every(
          (session) =>
            isRecord(session) &&
            hasOnlyKeys(session, ["date", "session_title", "note", "tasks"]) &&
            isNonEmptyString(session.date) &&
            isNonEmptyString(session.session_title) &&
            Array.isArray(session.tasks) &&
            session.tasks.every((task) => typeof task === "string"),
        ) &&
        (payload.goal === null || payload.goal === undefined || isNonEmptyString(payload.goal)) &&
        (payload.week_start === null || payload.week_start === undefined || typeof payload.week_start === "string")
      ) {
        return { type, payload: payload as unknown as ScheduleMealPrepPayload };
      }
      return null;
    }
    case "add_fridge_items": {
      if (
        hasOnlyKeys(payload, ["items"]) &&
        Array.isArray(payload.items) &&
        payload.items.every(
          (item) =>
            isRecord(item) &&
            hasOnlyKeys(item, ["name", "category", "quantity", "unit"]) &&
            isNonEmptyString(item.name) &&
            (item.category === null || item.category === undefined || typeof item.category === "string") &&
            (item.quantity === null || item.quantity === undefined || typeof item.quantity === "number") &&
            (item.unit === null || item.unit === undefined || typeof item.unit === "string"),
        )
      ) {
        return { type, payload: payload as unknown as AddFridgeItemsPayload };
      }
      return null;
    }
    case "set_goal": {
      if (
        hasOnlyKeys(payload, ["goal", "timeline"]) &&
        isNonEmptyString(payload.goal) &&
        (payload.timeline === null || payload.timeline === undefined || typeof payload.timeline === "string")
      ) {
        return { type, payload: payload as unknown as SetGoalPayload };
      }
      return null;
    }
    case "suggest_groceries": {
      if (
        hasOnlyKeys(payload, ["items"]) &&
        Array.isArray(payload.items) &&
        payload.items.every(
          (item) =>
            isRecord(item) &&
            hasOnlyKeys(item, ["name", "reason"]) &&
            isNonEmptyString(item.name) &&
            (item.reason === null || item.reason === undefined || typeof item.reason === "string"),
        )
      ) {
        return { type, payload: payload as unknown as SuggestGroceriesPayload };
      }
      return null;
    }
    case "cheat_day": {
      if (
        hasOnlyKeys(payload, ["eligible", "reason"]) &&
        typeof payload.eligible === "boolean" &&
        (payload.reason === null || payload.reason === undefined || typeof payload.reason === "string")
      ) {
        return { type, payload: payload as unknown as CheatDayPayload };
      }
      return null;
    }
    default:
      return null;
  }
}

export function parseCoachActions(rawActions: unknown): CoachAction[] {
  if (!Array.isArray(rawActions)) {
    return [];
  }
  const parsed: CoachAction[] = [];
  for (const raw of rawActions) {
    const action = parseCoachAction(raw);
    if (action) {
      parsed.push(action);
    }
  }
  return parsed;
}

export interface CoachResult {
  request_id: string;
  reply: string;
  model_revision: string;
  confidence: number | null;
  refusal: string | null;
  citations: Citation[];
  proposed_actions: CoachAction[];
  is_mock: boolean;
}

export interface InferenceError {
  code: "network" | "timeout" | "http" | "invalid" | "not_configured" | "quota" | "unavailable";
  message: string;
  status?: number;
}

async function request<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  if (!BASE_URL) {
    throw {
      code: "not_configured",
      message: "The service isn't available on this build yet.",
    } as InferenceError;
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (API_TOKEN) {
    headers["X-API-Key"] = API_TOKEN;
  }
  try {
    const response = await Promise.race([
      fetch(`${BASE_URL}${path}`, {
        ...init,
        headers,
      }),
      new Promise<never>((resolve, reject) =>
        setTimeout(
          () => reject(zeroGPUError("timeout", "Couldn't reach the service. Please try again.")),
          timeoutMs,
        ),
      ),
    ]);
    if (!response.ok) {
      const status = response.status;
      throw {
        code: "http",
        message:
          status === 429 || status === 402
            ? "Daily analysis limit reached. Please try again later."
            : `Something went wrong (${status}). Please try again.`,
        status,
      } as InferenceError;
    }
    return (await response.json()) as T;
  } catch (error) {
    if ((error as InferenceError)?.code) {
      throw error;
    }
    console.warn("[thrivelens] request failed:", String(error));
    throw {
      code: "network",
      message: "Couldn't reach the service. Please check your connection and try again.",
    } as InferenceError;
  }
}

export function makeRequestId(): string {
  return Crypto.randomUUID();
}

function serializeCoachContext(context: CoachContext): Record<string, unknown> {
  return {
    request_id: context.request_id ?? makeRequestId(),
    profile: context.profile ?? null,
    goal_timeline: context.goal_timeline ?? null,
    dietary_restrictions: context.dietary_restrictions ?? [],
    recent_food_logs: context.recent_food_logs ?? [],
    fridge_items: context.fridge_items ?? [],
    active_meal_plan: context.active_meal_plan ?? null,
    active_workout_plan: context.active_workout_plan ?? null,
    meal_plans: context.meal_plans ?? [],
    workout_plan: context.workout_plan ?? null,
    schedules: context.schedules ?? [],
    adherence: context.adherence ?? null,
    now_iso: context.now_iso ?? null,
    timezone: context.timezone ?? null,
    location: context.location ?? null,
  };
}

export async function analyzeImage(uri: string, requestId?: string): Promise<AnalyzeResult> {
  if (!BASE_URL) {
    throw {
      code: "not_configured",
      message: "The service isn't available on this build yet.",
    } as InferenceError;
  }
  const rid = requestId ?? makeRequestId();
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (API_TOKEN) {
      headers["X-API-Key"] = API_TOKEN;
    }
    const result = await nativeUpload(
      `${BASE_URL}/v1/food/analyze`,
      uri,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "image",
        mimeType: "image/jpeg",
        parameters: { request_id: rid },
        headers,
      },
      45000,
      "Couldn't complete the analysis in time. Please try again.",
    );
    if (result.status < 200 || result.status >= 300) {
      const status = result.status;
      throw {
        code: "http",
        message:
          status === 429 || status === 402
            ? "Daily analysis limit reached. Please try again later."
            : `Something went wrong (${status}). Please try again.`,
        status,
      } as InferenceError;
    }
    try {
      return JSON.parse(result.body) as AnalyzeResult;
    } catch {
      console.warn("[thrivelens] analyzeImage: non-JSON body");
      throw {
        code: "invalid",
        message: "We couldn't read the response from the service.",
      } as InferenceError;
    }
  } catch (error) {
    if ((error as InferenceError)?.code) {
      throw error;
    }
    console.warn("[thrivelens] analyzeImage failed:", String(error ?? "null"));
    throw {
      code: "network",
      message: "Couldn't reach the service. Please check your connection and try again.",
    } as InferenceError;
  }
}

export function lookupNutrition(params: {
  food_name: string;
  amount_g: number;
  barcode?: string | null;
  request_id?: string;
}): Promise<NutritionResult> {
  if (isZeroGPUConfigured()) {
    return lookupNutritionZeroGPU(params).catch(() =>
      request<NutritionResult>(
        "/v1/nutrition/lookup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: params.request_id ?? makeRequestId(),
            food_name: params.food_name,
            amount_g: params.amount_g,
            barcode: params.barcode ?? null,
          }),
        },
        15000,
      ),
    );
  }
  return request<NutritionResult>(
    "/v1/nutrition/lookup",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: params.request_id ?? makeRequestId(),
        food_name: params.food_name,
        amount_g: params.amount_g,
        barcode: params.barcode ?? null,
      }),
    },
    15000,
  );
}

const LOCAL_COACH_TIMEOUT_MS = 8000;

export function coachChat(params: {
  context: CoachContext;
  messages: CoachMessage[];
}): Promise<CoachResult> {
  const serialized = serializeCoachContext(params.context);
  if (!BASE_URL) {
    return coachChatZeroGPU(params);
  }
  const callLocal = request<CoachResult>(
    "/v1/coach/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: serialized,
        messages: params.messages,
      }),
    },
    LOCAL_COACH_TIMEOUT_MS,
  );
  if (isZeroGPUConfigured()) {
    return callLocal.catch(() => coachChatZeroGPU(params));
  }
  return callLocal;
}

export interface ZeroGPUAnalyzeResult {
  candidate_status: CandidateStatus;
  candidates: FoodCandidate[];
  confidence: number | null;
  abstention_reason: string | null;
  model_revision: string;
  is_mock: boolean;
}

export function isZeroGPUConfigured(): boolean {
  return Boolean(ZEROGPU_URL);
}

function zeroGPUError(
  code: InferenceError["code"],
  message: string,
  status?: number,
): InferenceError {
  return { code, message, status };
}

async function nativeUpload(
  url: string,
  uri: string,
  options: FileSystem.FileSystemUploadOptions,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<FileSystem.FileSystemUploadResult> {
  const task = FileSystem.createUploadTask(url, uri, options);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      void task.cancelAsync();
      resolve(null);
    }, timeoutMs);
  });
  const result = await Promise.race([task.uploadAsync(), timeout]);
  if (timer) {
    clearTimeout(timer);
  }
  if (!result) {
    throw zeroGPUError("timeout", timeoutMessage);
  }
  return result;
}

async function gradioUpload(uri: string): Promise<string> {
  if (!ZEROGPU_URL) {
    throw zeroGPUError("not_configured", "The service isn't available on this build yet.");
  }
  try {
    console.log("[thrivelens] analyze: upload started", uri.slice(0, 60));
    const result = await nativeUpload(
      `${ZEROGPU_URL}/gradio_api/upload`,
      uri,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "files",
        mimeType: "image/jpeg",
        headers: HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : undefined,
      },
      45000,
      "Couldn't complete the upload in time. Please try again.",
    );
    console.log("[thrivelens] analyze: upload response", result.status);
    if (result.status === 429 || result.status === 402) {
      throw zeroGPUError("quota", "Daily analysis limit reached. Please try again later.", result.status);
    }
    if (result.status < 200 || result.status >= 300) {
      throw zeroGPUError("http", `Something went wrong (${result.status}). Please try again.`, result.status);
    }
    let filePath: string | undefined;
    try {
      const files = JSON.parse(result.body) as { path: string }[] | string[];
      const first = Array.isArray(files) ? files[0] : undefined;
      filePath =
        typeof first === "string" ? first : (first as { path?: string } | undefined)?.path;
    } catch {
      console.warn("[thrivelens] analyze: non-JSON upload body");
    }
    if (!filePath) {
      throw zeroGPUError("invalid", "We couldn't prepare the photo for analysis.");
    }
    return filePath;
  } catch (error) {
    if ((error as InferenceError)?.code) {
      console.warn("[thrivelens] analyze upload error:", (error as InferenceError).code);
      throw error;
    }
    console.warn("[thrivelens] analyze upload unexpected:", String(error ?? "null"));
    throw zeroGPUError("network", "Couldn't reach the service. Please check your connection and try again.");
  }
}

async function gradioAnalyze(filePath: string): Promise<ZeroGPUAnalyzeResult> {
  if (!ZEROGPU_URL) {
    throw zeroGPUError("not_configured", "The service isn't available on this build yet.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (HF_TOKEN) {
    headers.Authorization = `Bearer ${HF_TOKEN}`;
  }
  try {
    const response = await fetch(`${ZEROGPU_URL}/gradio_api/call/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: [{ path: filePath, meta: { _type: "gradio.FileData" } }],
      }),
      signal: controller.signal,
    });
    if (response.status === 429 || response.status === 402) {
      throw zeroGPUError("quota", "Daily analysis limit reached. Please try again later.", response.status);
    }
    if (!response.ok) {
      throw zeroGPUError("http", `Something went wrong (${response.status}). Please try again.`, response.status);
    }
    const started = (await response.json()) as { event_id: string };
    if (!started?.event_id) {
      throw zeroGPUError("invalid", "We couldn't start the analysis.");
    }
    const output = await gradioPollEvent(started.event_id);
    return parseGradioOutput(output);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw zeroGPUError("timeout", "Couldn't complete the analysis in time. Please try again.");
    }
    if ((error as InferenceError)?.code) {
      throw error;
    }
    throw zeroGPUError("network", "Couldn't reach the service. Please check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

async function gradioRun(apiName: string, payload: unknown, timeoutMs: number): Promise<unknown[]> {
  if (!ZEROGPU_URL) {
    throw zeroGPUError("not_configured", "The service isn't available on this build yet.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (HF_TOKEN) {
    headers.Authorization = `Bearer ${HF_TOKEN}`;
  }
  try {
    const response = await fetch(`${ZEROGPU_URL}/gradio_api/call/${apiName}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ data: [payload] }),
      signal: controller.signal,
    });
    if (response.status === 429 || response.status === 402) {
      throw zeroGPUError("quota", "Daily analysis limit reached. Please try again later.", response.status);
    }
    if (!response.ok) {
      throw zeroGPUError("http", `Something went wrong (${response.status}). Please try again.`, response.status);
    }
    const started = (await response.json()) as { event_id: string };
    if (!started?.event_id) {
      throw zeroGPUError("invalid", "We couldn't start the request.");
    }
    return gradioPollEvent(started.event_id, apiName, timeoutMs);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw zeroGPUError("timeout", "Couldn't complete the request in time. Please try again.");
    }
    if ((error as InferenceError)?.code) {
      throw error;
    }
    throw zeroGPUError("network", "Couldn't reach the service. Please check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

async function gradioPollEvent(
  eventId: string,
  apiName = "analyze",
  budgetMs = 85000,
): Promise<unknown[]> {
  if (!ZEROGPU_URL) {
    throw zeroGPUError("not_configured", "The service isn't available on this build yet.");
  }
  const url = `${ZEROGPU_URL}/gradio_api/call/${apiName}/${eventId}`;
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const headers: Record<string, string> = { Accept: "text/event-stream" };
    if (HF_TOKEN) {
      headers.Authorization = `Bearer ${HF_TOKEN}`;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    const controller = new AbortController();
    const requestTimer = setTimeout(() => controller.abort(), remaining);
    try {
      let response: Response;
      try {
        response = await fetch(url, { headers, signal: controller.signal });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          continue;
        }
        throw zeroGPUError("network", "Couldn't reach the service. Please check your connection and try again.");
      }
      if (response.status === 429 || response.status === 402) {
        throw zeroGPUError("quota", "Daily analysis limit reached. Please try again later.", response.status);
      }
      if (!response.ok) {
        throw zeroGPUError("http", `Something went wrong (${response.status}). Please try again.`, response.status);
      }
      const text = await response.text();
      const parsed = parseSSE(text);
      if (parsed.event === "complete") {
        return (parsed.data ?? []) as unknown[];
      }
      if (parsed.event === "error") {
        throw zeroGPUError("http", "We couldn't process the request. Please try again.");
      }
      if (parsed.event === "aborted") {
        throw zeroGPUError("invalid", "We couldn't process the request. Please try again.");
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } finally {
      clearTimeout(requestTimer);
    }
  }
  throw zeroGPUError("timeout", "Couldn't complete the request in time. Please try again.");
}

function parseSSE(raw: string): { event?: string; data?: unknown } {
  let event: string | undefined;
  let dataLine = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLine = line.slice(5).trim();
    }
  }
  let data: unknown = dataLine;
  if (dataLine) {
    try {
      data = JSON.parse(dataLine);
    } catch {
      // keep as string
    }
  }
  return { event, data };
}

function parseGradioOutput(data: unknown[]): ZeroGPUAnalyzeResult {
  const raw = data?.[0];
  if (typeof raw === "string") {
    try {
      return normalizeGradioPayload(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      /* fall through */
    }
  }
  if (raw !== null && typeof raw === "object") {
    return normalizeGradioPayload(raw as Record<string, unknown>);
  }
  throw zeroGPUError("invalid", "We couldn't read the response from the service.");
}

function normalizeGradioPayload(payload: Record<string, unknown>): ZeroGPUAnalyzeResult {
  const error = payload.error as { code?: string; message?: string } | undefined;
  if (error || !payload.candidate_status) {
    throw zeroGPUError("http", "We couldn't process the request. Please try again.");
  }
  return payload as unknown as ZeroGPUAnalyzeResult;
}

export async function analyzeImageZeroGPU(uri: string): Promise<ZeroGPUAnalyzeResult> {
  const filePath = await gradioUpload(uri);
  return gradioAnalyze(filePath);
}

export async function lookupNutritionZeroGPU(params: {
  food_name: string;
  amount_g: number;
  barcode?: string | null;
  request_id?: string;
}): Promise<NutritionResult> {
  const payload = {
    request_id: params.request_id ?? makeRequestId(),
    food_name: params.food_name,
    amount_g: params.amount_g,
    barcode: params.barcode ?? null,
  };
  const output = await gradioRun("lookup", payload, 45000);
  const raw = output?.[0];
  const record = normalizeZeroGPUPayload(raw, "Nutrition lookup");
  return record as unknown as NutritionResult;
}

export async function coachChatZeroGPU(params: {
  context: CoachContext;
  messages: CoachMessage[];
}): Promise<CoachResult> {
  const payload = {
    context: serializeCoachContext(params.context),
    messages: params.messages,
  };
  const output = await gradioRun("chat", payload, 125000);
  const raw = output?.[0];
  const record = normalizeZeroGPUPayload(raw, "Coach");
  return record as unknown as CoachResult;
}

function normalizeZeroGPUPayload(raw: unknown, label: string): Record<string, unknown> {
  let record: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      record = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      record = null;
    }
  } else if (raw !== null && typeof raw === "object") {
    record = raw as Record<string, unknown>;
  }
  if (!record) {
    throw zeroGPUError("invalid", "We couldn't read the response from the service.");
  }
  const error = record.error as { code?: string; message?: string } | undefined;
  if (error) {
    throw zeroGPUError(
      "http",
      "We couldn't process the request. Please try again.",
      error.code === "chat_too_large" ? 413 : undefined,
    );
  }
  return record;
}