import * as Crypto from "expo-crypto";
import { currentUserId } from "@/lib/auth";
import {
  WorkoutSession,
  WorkoutLog,
  insertWorkoutSession,
  insertWorkoutLog,
  recentWorkoutSessions,
  workoutSessionsSince,
  workoutLogsSince,
  seedExerciseCatalog,
} from "@/db";
import exercisesData from "@/data/exercises.json";

const exerciseCatalogSeed = exercisesData.exercises.map((exercise) => ({
  id: exercise.id,
  name: exercise.name,
  bodyPart: exercise.bodyPart,
  targetMuscle: exercise.bodyPart,
  equipment: exercise.equipment,
  difficulty: exercise.level,
  instructions: exercise.description,
  imageUrl: exercise.videoPath || null,
  videoUrl: exercise.videoPath || null,
  createdAt: new Date().toISOString(),
}));

export interface WorkoutExerciseInput {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  repsPerSet: number;
  weightKg: number;
}

export interface LogWorkoutInput {
  workoutName: string;
  startedAt?: number;
  exercises: WorkoutExerciseInput[];
}

export async function logWorkout(input: LogWorkoutInput): Promise<{
  session: WorkoutSession;
  logs: WorkoutLog[];
}> {
  const userId = await currentUserId();
  if (!userId) throw new Error("You must be signed in to log a workout.");
  const now = Date.now();
  const sessionId = Crypto.randomUUID();
  const startedAt = input.startedAt ?? now;
  const totalVolume = input.exercises.reduce(
    (sum, exercise) => sum + exercise.sets * exercise.repsPerSet * exercise.weightKg,
    0,
  );

  await seedExerciseCatalog(exerciseCatalogSeed);

  const session = await insertWorkoutSession({
    id: sessionId,
    userId,
    planId: null,
    dayId: null,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(now).toISOString(),
    totalVolume,
    createdAt: new Date(now).toISOString(),
  });

  const logs: WorkoutLog[] = [];
  for (const exercise of input.exercises) {
    const log = await insertWorkoutLog({
      id: Crypto.randomUUID(),
      userId,
      exerciseId: exercise.exerciseId,
      sessionId,
      loggedAt: new Date(now).toISOString(),
      setsCompleted: exercise.sets,
      reps: `${exercise.repsPerSet} x ${exercise.sets}`,
      weight: exercise.weightKg,
      durationSeconds: null,
      notes: input.workoutName,
      createdAt: new Date(now).toISOString(),
    });
    logs.push(log);
  }

  return { session, logs };
}

export async function getRecentWorkouts(limit: number = 10): Promise<WorkoutSession[]> {
  const userId = await currentUserId();
  return recentWorkoutSessions(limit, userId ?? undefined);
}

export async function getWorkoutVolumeSince(epochMs: number): Promise<number> {
  const userId = await currentUserId();
  const logs = await workoutLogsSince(epochMs, 500, userId ?? undefined);
  return logs.reduce((sum, log) => sum + (log.weight ?? 0) * (log.setsCompleted ?? 0), 0);
}

export async function getWorkoutCountSince(epochMs: number): Promise<number> {
  const userId = await currentUserId();
  const sessions = await workoutSessionsSince(epochMs, 500, userId ?? undefined);
  return sessions.length;
}