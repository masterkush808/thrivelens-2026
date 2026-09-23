import { supabase, supabaseConfigured } from "@/lib/supabase";
import {
  listReadyOperations,
  markOperationConflict,
  markOperationFailed,
  markOperationSucceeded,
} from "@/db/outbox";

export async function flushOutbox(userId: string) {
  if (!supabaseConfigured) return;

  const operations = listReadyOperations(userId);

  for (const operation of operations) {
    try {
      const payload = JSON.parse(operation.payload) as Record<string, unknown>;
      if (operation.entity === "profiles" && operation.operation === "upsert") {
        const { id, ...updates } = payload;
        if (typeof id !== "string" || id !== userId) {
          throw new Error(`Profile outbox id (${String(id)}) differs from signed-in user (${userId})`);
        }
        const { data: updated, error } = await supabase
          .from("profiles")
          .update(updates)
          .eq("id", id)
          .select();
        if (error) throw error;
        if (!updated || updated.length !== 1) {
          throw new Error(`Profile ${id} not found during sync; none updated`);
        }
      } else if (operation.entity === "food_logs" && operation.operation === "upsert") {
        const { error } = await supabase.from("food_logs").upsert(payload, { onConflict: "id" });
        if (error) throw error;
      } else {
        throw new Error(`Unsupported outbox operation: ${operation.entity}/${operation.operation}`);
      }
      markOperationSucceeded(operation.operation_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";
      if (message.includes("409") || message.includes("412") || message.toLowerCase().includes("conflict")) {
        markOperationConflict(operation.operation_id, message);
        continue;
      }
      markOperationFailed(
        operation.operation_id,
        operation.attempts,
        message,
      );
    }
  }
}
