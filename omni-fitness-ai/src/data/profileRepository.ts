import { supabase, supabaseConfigured } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { currentUser } from "@/lib/auth";
import { enqueueOperation } from "@/db/outbox";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  age: number | null;
  weight: number | null;
  height: number | null;
  gender: string | null;
  goal: string | null;
  goal_timeline: string | null;
  activity_level: string | null;
  experience: string | null;
  calorie_target: number | null;
  protein_target: number | null;
  dietary_preference: string | null;
  training_days_per_week: number | null;
  session_duration_minutes: number | null;
  workout_location: string | null;
  workout_type: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | "display_name"
    | "avatar_url"
    | "age"
    | "weight"
    | "height"
    | "gender"
    | "goal"
    | "goal_timeline"
    | "activity_level"
    | "experience"
    | "calorie_target"
    | "protein_target"
    | "dietary_preference"
    | "training_days_per_week"
    | "session_duration_minutes"
    | "workout_location"
    | "workout_type"
    | "onboarding_completed"
  >
>;

function defaultProfile(
  id: string,
  displayName: string | null,
): Profile {
  const now = new Date().toISOString();
  return {
    id,
    display_name: displayName,
    avatar_url: null,
    age: null,
    weight: null,
    height: null,
    gender: null,
    goal: null,
    goal_timeline: null,
    activity_level: null,
    experience: null,
    calorie_target: null,
    protein_target: null,
    dietary_preference: null,
    training_days_per_week: null,
    session_duration_minutes: null,
    workout_location: null,
    workout_type: null,
    onboarding_completed: false,
    created_at: now,
    updated_at: now,
  };
}

async function writeCache(userId: string, profile: Profile) {
  await AsyncStorage.setItem(`profile:${userId}`, JSON.stringify(profile));
}

export async function getCurrentProfile(): Promise<Profile> {
  const user = await currentUser();
  if (!user) throw new Error("You must be signed in to load your profile.");

  if (!supabaseConfigured) {
    const cached = await AsyncStorage.getItem(`profile:${user.id}`);
    if (cached) {
      try {
        return JSON.parse(cached) as Profile;
      } catch {
        // fall through to a default profile
      }
    }
    return defaultProfile(user.id, user.fullName);
  }

  const cached = await AsyncStorage.getItem(`profile:${user.id}`);
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) {
    if (cached) return JSON.parse(cached) as Profile;
    throw error;
  }
  await writeCache(user.id, data as Profile);
  return data as Profile;
}

export async function updateCurrentProfile(update: ProfileUpdate): Promise<Profile> {
  const user = await currentUser();
  if (!user) throw new Error("You must be signed in to update your profile.");

  const cachedProfile = await AsyncStorage.getItem(`profile:${user.id}`);
  const base = cachedProfile
    ? (JSON.parse(cachedProfile) as Profile)
    : defaultProfile(user.id, user.fullName);
  const optimistic: Profile = {
    ...base,
    ...update,
    updated_at: new Date().toISOString(),
  };
  await writeCache(user.id, optimistic);

  if (!supabaseConfigured) {
    return optimistic;
  }

  const payload = { id: user.id, ...update };
  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id)
    .select("*")
    .single();
  if (error) {
    await enqueueOperation({
      operationId: `${user.id}:profiles:${Date.now()}`,
      userId: user.id,
      entity: "profiles",
      operation: "upsert",
      payload,
    });
    return optimistic;
  }
  await writeCache(user.id, data as Profile);
  return data as Profile;
}

export async function clearAccountCache(userId: string) {
  const { clearUserOutbox } = await import("@/db/outbox");
  await clearUserOutbox(userId);
  await AsyncStorage.removeItem(`profile:${userId}`);
}

export async function exportAccountData(userId: string) {
  const defaultTables = ["profiles", "workout_plans", "workout_days", "workout_exercises", "workout_sessions", "workout_logs", "food_logs", "progress_logs", "notifications"] as const;

  if (!supabaseConfigured) {
    const { foodLogsForUser } = await import("@/db");
    const [profileRaw, foodLogs] = await Promise.all([
      AsyncStorage.getItem(`profile:${userId}`),
      foodLogsForUser(userId),
    ]);
    return {
      profiles: profileRaw ? [JSON.parse(profileRaw) as Profile] : [],
      food_logs: foodLogs,
    };
  }

  const result: Record<string, unknown[]> = {};
  for (const table of defaultTables) {
    const query = table === "profiles"
      ? supabase.from(table).select("*").eq("id", userId)
      : supabase.from(table).select("*").eq("user_id", userId);
    const { data, error } = await query;
    if (error) throw error;
    result[table] = data ?? [];
  }
  return result;
}

export async function deleteCurrentAccount() {
  const user = await currentUser();
  if (!user) throw new Error("You must be signed in to delete your account.");
  if (!supabaseConfigured) return;
  const { error } = await supabase.rpc("delete_current_account");
  if (error) throw error;
  await clearAccountCache(user.id);
  await supabase.auth.signOut();
}