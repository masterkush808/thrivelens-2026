import * as SecureStore from "expo-secure-store";

import { CoachProfile } from "@/services/inference";
import { getCurrentProfile } from "@/data/profileRepository";

const PROFILE_KEY = "thrivelens.profile";

/**
 * Builds the coach context profile from the real saved profile (local or
 * Supabase-synced). Falls back to the legacy SecureStore value that stored a
 * full fidelity copy, so previously saved profiles still work.
 */
export async function getCoachProfile(): Promise<CoachProfile | null> {
  try {
    const profile = await getCurrentProfile();
    return {
      height_cm: profile.height,
      weight_kg: profile.weight,
      age: profile.age,
      gender: profile.gender,
      goal: profile.goal,
      activity_level: profile.activity_level,
      dietary_preference: profile.dietary_preference,
      dietary_restrictions: [],
    };
  } catch {
    try {
      const raw = await SecureStore.getItemAsync(PROFILE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CoachProfile;
      return parsed?.weight_kg || parsed?.goal ? parsed : null;
    } catch {
      return null;
    }
  }
}

export async function saveCoachProfile(profile: CoachProfile): Promise<void> {
  await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
}