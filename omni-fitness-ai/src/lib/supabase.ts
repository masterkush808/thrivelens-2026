import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const PLACEHOLDER_URLS = new Set([
  "https://your-project.supabase.co",
  "https://your-project-ref.supabase.co",
]);

/**
 * True only when real Supabase credentials are present. Untouched
 * .env placeholders fall through to local-only mode so the app stays
 * fully usable offline without a hosted backend.
 */
export function isSupabaseConfigured(): boolean {
  const configured =
    Boolean(supabaseUrl && supabaseAnonKey) &&
    !PLACEHOLDER_URLS.has((supabaseUrl ?? "").replace(/\/+$/, ""));

  return configured;
}

export const supabaseConfigured = isSupabaseConfigured();

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : (null as unknown as SupabaseClient);