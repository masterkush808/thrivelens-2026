import { and, asc, eq } from "drizzle-orm";

import { db, ensureSchema } from "./client";
import { fridgeItems, FridgeItem, NewFridgeItem } from "./schema";

ensureSchema();

export async function insertFridgeItems(inputs: NewFridgeItem[]): Promise<FridgeItem[]> {
  for (const input of inputs) {
    await db.insert(fridgeItems).values(input);
  }
  return db
    .select()
    .from(fridgeItems)
    .where(
      eq(
        fridgeItems.id,
        inputs[inputs.length - 1]?.id ?? "",
      ),
    )
    .limit(1);
}

export async function fridgeItemsForUser(userId: string): Promise<FridgeItem[]> {
  return db
    .select()
    .from(fridgeItems)
    .where(and(eq(fridgeItems.userId, userId), eq(fridgeItems.used, false)))
    .orderBy(asc(fridgeItems.addedDate));
}

export async function deleteFridgeItem(id: string, userId: string): Promise<void> {
  await db.delete(fridgeItems).where(and(eq(fridgeItems.id, id), eq(fridgeItems.userId, userId)));
}

export async function markFridgeItemUsed(id: string, userId: string): Promise<void> {
  await db
    .update(fridgeItems)
    .set({ used: true })
    .where(and(eq(fridgeItems.id, id), eq(fridgeItems.userId, userId)));
}

export async function deleteFridgeItemsForUser(userId: string): Promise<void> {
  await db.delete(fridgeItems).where(eq(fridgeItems.userId, userId));
}