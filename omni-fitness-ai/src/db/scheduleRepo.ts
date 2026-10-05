import { and, asc, eq } from "drizzle-orm";

import { db, ensureSchema } from "./client";
import { schedules, Schedule, NewSchedule } from "./schema";

void ensureSchema();

export async function insertSchedules(inputs: NewSchedule[]): Promise<Schedule[]> {
  for (const input of inputs) {
    await db.insert(schedules).values(input);
  }
  return db
    .select()
    .from(schedules)
    .where(
      eq(
        schedules.id,
        inputs[inputs.length - 1]?.id ?? "",
      ),
    )
    .limit(1);
}

export async function schedulesForUser(userId: string): Promise<Schedule[]> {
  return db
    .select()
    .from(schedules)
    .where(eq(schedules.userId, userId))
    .orderBy(asc(schedules.scheduledFor));
}

export async function upcomingSchedulesForUser(userId: string): Promise<Schedule[]> {
  return db
    .select()
    .from(schedules)
    .where(and(eq(schedules.userId, userId), eq(schedules.status, "scheduled")))
    .orderBy(asc(schedules.scheduledFor));
}

export async function scheduleByIdForUser(id: string, userId: string): Promise<Schedule | null> {
  const rows = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.id, id), eq(schedules.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function completeScheduleForUser(id: string, userId: string): Promise<void> {
  await db
    .update(schedules)
    .set({ status: "completed", updatedAt: new Date().toISOString() })
    .where(and(eq(schedules.id, id), eq(schedules.userId, userId)));
}

export async function cancelScheduleForUser(id: string, userId: string): Promise<void> {
  await db
    .update(schedules)
    .set({ status: "cancelled", updatedAt: new Date().toISOString() })
    .where(and(eq(schedules.id, id), eq(schedules.userId, userId)));
}

export async function deleteSchedulesForUser(userId: string): Promise<void> {
  await db.delete(schedules).where(eq(schedules.userId, userId));
}