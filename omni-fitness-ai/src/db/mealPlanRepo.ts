import { desc, eq } from "drizzle-orm";

import { db, ensureSchema } from "./client";
import { mealPlans, MealPlan, NewMealPlan } from "./schema";

ensureSchema();

export async function upsertMealPlan(input: NewMealPlan): Promise<MealPlan> {
  await db.delete(mealPlans).where(eq(mealPlans.userId, input.userId));
  await db.insert(mealPlans).values(input);
  const rows = await db
    .select()
    .from(mealPlans)
    .where(eq(mealPlans.id, input.id!))
    .limit(1);
  return rows[0];
}

export async function activeMealPlan(userId: string): Promise<MealPlan | null> {
  const rows = await db
    .select()
    .from(mealPlans)
    .where(eq(mealPlans.userId, userId))
    .orderBy(desc(mealPlans.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteMealPlansForUser(userId: string): Promise<void> {
  await db.delete(mealPlans).where(eq(mealPlans.userId, userId));
}