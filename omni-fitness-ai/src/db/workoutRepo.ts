import { and, desc, eq, gte } from "drizzle-orm";

import { db, ensureSchema } from "./client";
import {
  exercises,
  WorkoutLog,
  workoutLogs,
  workoutSessions,
  progressLogs,
  NewWorkoutSession,
  NewWorkoutLog,
  NewProgressLog,
  ProgressLog,
  NewExercise,
  Exercise,
  WorkoutSession,
} from "./schema";

ensureSchema();

export async function insertExercise(input: NewExercise): Promise<Exercise> {
  await db.insert(exercises).values(input).onConflictDoNothing();
  const rows = await db.select().from(exercises).where(eq(exercises.id, input.id)).limit(1);
  return rows[0];
}

export async function seedExerciseCatalog(input: NewExercise[]): Promise<void> {
  for (const exercise of input) {
    await db.insert(exercises).values(exercise).onConflictDoNothing();
  }
}

export async function allExercises(): Promise<Exercise[]> {
  return db.select().from(exercises).orderBy(desc(exercises.createdAt)).limit(500);
}

export async function insertWorkoutSession(input: NewWorkoutSession): Promise<WorkoutSession> {
  await db.insert(workoutSessions).values(input);
  const rows = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.id, input.id))
    .limit(1);
  return rows[0];
}

export async function insertWorkoutLog(input: NewWorkoutLog): Promise<WorkoutLog> {
  await db.insert(workoutLogs).values(input);
  const rows = await db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.id, input.id))
    .limit(1);
  return rows[0];
}

export async function recentWorkoutSessions(
  limit: number = 10,
  userId?: string,
): Promise<WorkoutSession[]> {
  const query = db.select().from(workoutSessions);
  const filtered = userId
    ? query.where(eq(workoutSessions.userId, userId))
    : query;
  return filtered.orderBy(desc(workoutSessions.createdAt)).limit(limit);
}

export async function workoutSessionsSince(
  epochMs: number,
  limit: number = 50,
  userId?: string,
): Promise<WorkoutSession[]> {
  const query = db.select().from(workoutSessions);
  const filtered = userId
    ? query.where(
        and(
          gte(workoutSessions.createdAt, new Date(epochMs).toISOString()),
          eq(workoutSessions.userId, userId),
        ),
      )
    : query.where(gte(workoutSessions.createdAt, new Date(epochMs).toISOString()));
  return filtered.orderBy(desc(workoutSessions.createdAt)).limit(limit);
}

export async function workoutLogsForSession(sessionId: string): Promise<WorkoutLog[]> {
  return db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.sessionId, sessionId))
    .orderBy(desc(workoutLogs.createdAt));
}

export async function allWorkoutLogs(
  limit: number = 500,
  userId?: string,
): Promise<WorkoutLog[]> {
  const query = db.select().from(workoutLogs);
  const filtered = userId ? query.where(eq(workoutLogs.userId, userId)) : query;
  return filtered.orderBy(desc(workoutLogs.loggedAt)).limit(limit);
}

export async function workoutLogsByExercise(
  exerciseId: string,
  limit: number = 200,
  userId?: string,
): Promise<WorkoutLog[]> {
  const query = db.select().from(workoutLogs);
  const filtered = userId
    ? query.where(
        and(eq(workoutLogs.exerciseId, exerciseId), eq(workoutLogs.userId, userId)),
      )
    : query.where(eq(workoutLogs.exerciseId, exerciseId));
  return filtered.orderBy(desc(workoutLogs.loggedAt)).limit(limit);
}

export async function workoutLogsSince(
  epochMs: number,
  limit: number = 200,
  userId?: string,
): Promise<WorkoutLog[]> {
  const query = db.select().from(workoutLogs);
  const filtered = userId
    ? query.where(
        and(
          gte(workoutLogs.loggedAt, new Date(epochMs).toISOString()),
          eq(workoutLogs.userId, userId),
        ),
      )
    : query.where(gte(workoutLogs.loggedAt, new Date(epochMs).toISOString()));
  return filtered.orderBy(desc(workoutLogs.loggedAt)).limit(limit);
}

export async function insertProgressLog(input: NewProgressLog): Promise<ProgressLog> {
  await db.insert(progressLogs).values(input);
  const rows = await db
    .select()
    .from(progressLogs)
    .where(eq(progressLogs.id, input.id))
    .limit(1);
  return rows[0];
}

export async function recentProgressLogs(
  limit: number = 20,
  userId?: string,
): Promise<ProgressLog[]> {
  const query = db.select().from(progressLogs);
  const filtered = userId ? query.where(eq(progressLogs.userId, userId)) : query;
  return filtered.orderBy(desc(progressLogs.loggedAt)).limit(limit);
}

export async function deleteWorkoutsForUser(userId: string): Promise<void> {
  await db.delete(workoutLogs).where(eq(workoutLogs.userId, userId));
  await db.delete(workoutSessions).where(eq(workoutSessions.userId, userId));
}

export async function deleteProgressLogsForUser(userId: string): Promise<void> {
  await db.delete(progressLogs).where(eq(progressLogs.userId, userId));
}

export type { WorkoutSession, WorkoutLog, ProgressLog } from "./schema";