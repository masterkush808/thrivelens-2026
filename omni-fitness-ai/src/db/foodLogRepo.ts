import { and, desc, eq, gte } from "drizzle-orm";

import { db, ensureSchema } from "./client";
import { foodLogs, FoodLog, NewFoodLog } from "./schema";

ensureSchema();

export async function insertFoodLog(input: NewFoodLog): Promise<FoodLog> {
  await db.insert(foodLogs).values(input);
  const rows = await db
    .select()
    .from(foodLogs)
    .where(eq(foodLogs.id, input.id!))
    .limit(1);
  return rows[0];
}

export async function deleteFoodLogsForUser(userId: string): Promise<void> {
  await db.delete(foodLogs).where(eq(foodLogs.userId, userId));
}

export async function foodLogsForUser(userId: string): Promise<FoodLog[]> {
  return db
    .select()
    .from(foodLogs)
    .where(eq(foodLogs.userId, userId))
    .orderBy(desc(foodLogs.date));
}

export async function recentFoodLogs(
  limit: number = 15,
  userId?: string,
): Promise<FoodLog[]> {
  const query = db.select().from(foodLogs);
  const filtered = userId ? query.where(eq(foodLogs.userId, userId)) : query;
  return filtered.orderBy(desc(foodLogs.date)).limit(limit);
}

export async function foodLogsSince(
  epochMs: number,
  limit: number = 15,
  userId?: string,
): Promise<FoodLog[]> {
  const query = db.select().from(foodLogs);
  const filtered = userId
    ? query.where(and(gte(foodLogs.date, Math.floor(epochMs)), eq(foodLogs.userId, userId)))
    : query.where(gte(foodLogs.date, Math.floor(epochMs)));
  return filtered.orderBy(desc(foodLogs.date)).limit(limit);
}