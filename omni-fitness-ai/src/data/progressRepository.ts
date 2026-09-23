import * as Crypto from "expo-crypto";
import { currentUserId } from "@/lib/auth";
import { ProgressLog, insertProgressLog, recentProgressLogs } from "@/db";
import { updateCurrentProfile } from "@/data/profileRepository";

export interface LogWeightInput {
  weightKg: number;
  notes?: string | null;
  loggedAt?: number;
}

export async function logWeight(input: LogWeightInput): Promise<ProgressLog> {
  const userId = await currentUserId();
  if (!userId) throw new Error("You must be signed in to log your weight.");
  const now = Date.now();
  const id = Crypto.randomUUID();
  const loggedAt = input.loggedAt ?? now;

  const log = await insertProgressLog({
    id,
    userId,
    loggedAt: new Date(loggedAt).toISOString(),
    weight: input.weightKg,
    bodyFat: null,
    notes: input.notes ?? null,
    createdAt: new Date(now).toISOString(),
  });

  await updateCurrentProfile({ weight: input.weightKg });

  return log;
}

export async function getWeightTrend(limit: number = 20): Promise<ProgressLog[]> {
  const userId = await currentUserId();
  return recentProgressLogs(limit, userId ?? undefined);
}