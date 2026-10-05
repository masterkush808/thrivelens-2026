import { desc, eq } from "drizzle-orm";

import { db, ensureSchema } from "./client";
import { cheatDays, CheatDay, NewCheatDay } from "./schema";

void ensureSchema();

export async function insertCheatDay(input: NewCheatDay): Promise<CheatDay> {
  await db.insert(cheatDays).values(input);
  const rows = await db
    .select()
    .from(cheatDays)
    .where(eq(cheatDays.id, input.id!))
    .limit(1);
  return rows[0];
}

export async function latestCheatDay(userId: string): Promise<CheatDay | null> {
  const rows = await db
    .select()
    .from(cheatDays)
    .where(eq(cheatDays.userId, userId))
    .orderBy(desc(cheatDays.date))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteCheatDaysForUser(userId: string): Promise<void> {
  await db.delete(cheatDays).where(eq(cheatDays.userId, userId));
}