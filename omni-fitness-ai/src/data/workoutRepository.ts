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
  workoutLogsForSession,
  workoutLogsByExercise,
  allWorkoutLogs,
  allExercises,
  seedExerciseCatalog,
} from "@/db";
import exercisesData from "@/data/exercises.json";
import {
  StrengthPoint,
  logVolumeKg,
  setVolumeKg,
  repsInBestSet,
  logEstimatedOneRepMax,
  personalRecords,
} from "@/data/workoutMetrics";

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

/**
 * Training volume for a time window, in kilograms.
 *
 * Uses the same canonical formula as every other figure in the app
 * (load x reps x sets via `logVolumeKg`). The previous implementation used
 * `weight * setsCompleted`, omitting repetitions, which produced a headline
 * total roughly an order of magnitude below the per-session figures rendered
 * directly beneath it.
 */
export async function getWorkoutVolumeSince(epochMs: number): Promise<number> {
  const userId = await currentUserId();
  const logs = await workoutLogsSince(epochMs, 2000, userId ?? undefined);
  return logs.reduce((sum, log) => sum + logVolumeKg(log), 0);
}

export async function getWorkoutCountSince(epochMs: number): Promise<number> {
  const userId = await currentUserId();
  const sessions = await workoutSessionsSince(epochMs, 500, userId ?? undefined);
  return sessions.length;
}

export interface StrengthSummary {
  workouts: number;
  exercises: number;
  sets: number;
  volumeKg: number;
  personalRecords: number;
  previousVolumeKg: number;
}

export async function getStrengthSummary(sinceMs: number): Promise<StrengthSummary> {
  const userId = await currentUserId();
  const uid = userId ?? undefined;
  const startIso = new Date(sinceMs).toISOString();
  const windowMs = Math.max(1, Date.now() - sinceMs);
  const previousSince = sinceMs - windowMs;

  const [sessions, logs, history] = await Promise.all([
    workoutSessionsSince(sinceMs, 500, uid),
    workoutLogsSince(sinceMs, 2000, uid),
    allWorkoutLogs(1000, uid),
  ]);

  const byExercise = new Map<string, StrengthPoint[]>();
  for (const log of history) {
    const e1rm = logEstimatedOneRepMax(log);
    if (e1rm === null) continue;
    const points = byExercise.get(log.exerciseId) ?? [];
    points.push({ at: log.loggedAt, e1rm });
    byExercise.set(log.exerciseId, points);
  }

  let personalRecordCount = 0;
  for (const points of byExercise.values()) {
    for (const record of personalRecords(points)) {
      if (record.at >= startIso) personalRecordCount += 1;
    }
  }

  const previousLogs = (await workoutLogsSince(previousSince, 2000, uid)).filter(
    (log) => log.loggedAt < startIso,
  );

  return {
    workouts: sessions.length,
    exercises: new Set(logs.map((log) => log.exerciseId)).size,
    sets: logs.reduce((sum, log) => sum + (log.setsCompleted ?? 0), 0),
    volumeKg: logs.reduce((sum, log) => sum + logVolumeKg(log), 0),
    personalRecords: personalRecordCount,
    previousVolumeKg: previousLogs.reduce((sum, log) => sum + logVolumeKg(log), 0),
  };
}

export interface SessionExerciseRow {
  exerciseId: string;
  name: string;
  weightKg: number | null;
  reps: number;
  sets: number;
  volumeKg: number;
  e1rm: number | null;
}

export interface SessionDetail {
  id: string;
  title: string;
  performedAt: string;
  exerciseCount: number;
  totalSets: number;
  volumeKg: number;
  exercises: SessionExerciseRow[];
}

export async function getRecentSessionDetails(
  limit: number = 5,
  sinceMs?: number,
): Promise<SessionDetail[]> {
  const userId = await currentUserId();
  const uid = userId ?? undefined;
  const [sessions, catalog] = await Promise.all([
    // When a window is supplied, only sessions inside it are listed. Without
    // this the "Recent Workouts" card ignored the active period filter and
    // showed arbitrarily old sessions under a "last 7D" heading.
    sinceMs === undefined
      ? recentWorkoutSessions(limit, uid)
      : workoutSessionsSince(sinceMs, limit, uid),
    allExercises(),
  ]);
  const names = new Map(catalog.map((exercise) => [exercise.id, exercise.name]));

  return Promise.all(
    sessions.map(async (session) => {
      const logs = await workoutLogsForSession(session.id);
      const ordered = [...logs].sort((a, b) =>
        (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
      );
      const exercises = ordered.map((log) => ({
        exerciseId: log.exerciseId,
        name: names.get(log.exerciseId) ?? log.exerciseId,
        weightKg: log.weight ?? null,
        reps: repsInBestSet(log),
        sets: log.setsCompleted ?? 0,
        volumeKg: logVolumeKg(log),
        e1rm: logEstimatedOneRepMax(log),
      }));
      return {
        id: session.id,
        title: ordered.find((log) => log.notes)?.notes ?? "Workout",
        performedAt: session.completedAt ?? session.createdAt,
        exerciseCount: exercises.length,
        totalSets: exercises.reduce((sum, row) => sum + row.sets, 0),
        volumeKg: exercises.reduce((sum, row) => sum + row.volumeKg, 0),
        exercises,
      };
    }),
  );
}

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  bestWeightKg: number | null;
  bestReps: number;
  bestE1rm: number | null;
  bestSetVolumeKg: number;
  sessions: number;
  personalRecords: number;
  history: StrengthPoint[];
}

export async function getExerciseProgress(
  exerciseId: string,
): Promise<ExerciseProgress | null> {
  const userId = await currentUserId();
  const uid = userId ?? undefined;
  const [logs, catalog] = await Promise.all([
    workoutLogsByExercise(exerciseId, 200, uid),
    allExercises(),
  ]);
  if (logs.length === 0) return null;

  const history: StrengthPoint[] = [];
  let bestWeightKg: number | null = null;
  let bestReps = 0;
  let bestSetVolumeKg = 0;

  for (const log of logs) {
    const reps = repsInBestSet(log);
    const weight = log.weight ?? null;
    if (weight !== null && weight > 0 && (bestWeightKg === null || weight > bestWeightKg)) {
      bestWeightKg = weight;
    }
    if (reps > bestReps) bestReps = reps;
    const single = setVolumeKg(log);
    if (single > bestSetVolumeKg) bestSetVolumeKg = single;
    const e1rm = logEstimatedOneRepMax(log);
    if (e1rm !== null) history.push({ at: log.loggedAt, e1rm });
  }

  history.sort((a, b) => a.at.localeCompare(b.at));

  return {
    exerciseId,
    name: catalog.find((exercise) => exercise.id === exerciseId)?.name ?? exerciseId,
    bestWeightKg,
    bestReps,
    bestE1rm: history.length > 0 ? Math.max(...history.map((point) => point.e1rm)) : null,
    bestSetVolumeKg,
    sessions: new Set(logs.map((log) => log.sessionId ?? log.id)).size,
    personalRecords: personalRecords(history).length,
    history,
  };
}

export async function getTrackedExerciseOptions(): Promise<{ id: string; name: string }[]> {
  const userId = await currentUserId();
  const uid = userId ?? undefined;
  const [logs, catalog] = await Promise.all([allWorkoutLogs(1000, uid), allExercises()]);
  const names = new Map(catalog.map((exercise) => [exercise.id, exercise.name]));
  const seen = new Map<string, string>();
  for (const log of logs) {
    if (!seen.has(log.exerciseId)) {
      seen.set(log.exerciseId, names.get(log.exerciseId) ?? log.exerciseId);
    }
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}