import { latestCheatDay, workoutSessionsSince } from "@/db";
import { getCurrentProfile } from "@/data/profileRepository";
import { AdherenceSnapshot } from "@/services/inference";

const DAY_MS = 86_400_000;

function startOfLocalDay(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

export async function buildAdherenceSnapshot(userId: string): Promise<AdherenceSnapshot | null> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

    const [sessions, profile, lastCheat] = await Promise.all([
      workoutSessionsSince(thirtyDaysAgo.getTime(), 200, userId),
      getCurrentProfile(),
      latestCheatDay(userId),
    ]);

    if (sessions.length === 0 && !profile.training_days_per_week) {
      return null;
    }

    const activeDates = new Set<number>();
    let loggedWorkouts = 0;
    for (const session of sessions) {
      if (!session.completedAt) continue;
      loggedWorkouts += 1;
      activeDates.add(Math.floor(startOfLocalDay(new Date(session.completedAt)) / DAY_MS));
    }

    const targetPerWeek = profile.training_days_per_week ?? 4;
    const targetDays30 = Math.round((30 * targetPerWeek) / 7);

    let streakDays = 0;
    const today = startOfLocalDay(now);
    let cursor = activeDates.has(Math.floor(today / DAY_MS))
      ? today
      : activeDates.has(Math.floor((today - DAY_MS) / DAY_MS))
        ? today - DAY_MS
        : null;
    while (cursor !== null) {
      streakDays += 1;
      const next = cursor - DAY_MS;
      cursor = activeDates.has(Math.floor(next / DAY_MS)) ? next : null;
    }

    return {
      active_days_30: activeDates.size,
      target_days_30: targetDays30,
      logged_workouts_30: loggedWorkouts,
      streak_days: streakDays,
      cheat_day_eligible: activeDates.size >= targetDays30 && loggedWorkouts > 0,
      last_cheat_day: lastCheat ? lastCheat.date : null,
    };
  } catch {
    return null;
  }
}