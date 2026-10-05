import { database } from "./client";

export type OutboxOperation = {
  operationId: string;
  userId: string;
  entity: string;
  operation: "upsert" | "delete";
  payload: Record<string, unknown>;
  baseVersion?: string;
  deletedAt?: string;
};

/**
 * Outbox queue for writes that must reach Supabase later.
 *
 * Every function is async because web SQLite has no synchronous API: the
 * expo-sqlite sync path needs SharedArrayBuffer, which browsers only expose to
 * cross-origin-isolated documents. See client.web.ts.
 */

export async function enqueueOperation(input: OutboxOperation): Promise<void> {
  const now = new Date().toISOString();
  await database.run(
    `INSERT INTO outbox (
      operation_id, user_id, entity, operation, payload, status,
      attempts, next_attempt_at, base_version, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?)
    ON CONFLICT(operation_id) DO NOTHING`,
    [
      input.operationId,
      input.userId,
      input.entity,
      input.operation,
      JSON.stringify(input.payload),
      now,
      input.baseVersion ?? null,
      input.deletedAt ?? null,
      now,
      now,
    ],
  );
}

export type OutboxRow = {
  operation_id: string;
  entity: string;
  operation: "upsert" | "delete";
  payload: string;
  attempts: number;
  base_version: string | null;
  deleted_at: string | null;
};

export async function listReadyOperations(
  userId: string,
  now = new Date().toISOString(),
): Promise<OutboxRow[]> {
  return database.all<OutboxRow>(
    `SELECT operation_id, entity, operation, payload, attempts, base_version, deleted_at
     FROM outbox
     WHERE user_id = ? AND status = 'pending' AND next_attempt_at <= ?
     ORDER BY created_at ASC`,
    [userId, now],
  );
}

export async function markOperationSucceeded(operationId: string): Promise<void> {
  await database.run("DELETE FROM outbox WHERE operation_id = ?", [operationId]);
}

export async function markOperationFailed(
  operationId: string,
  attempts: number,
  error: string,
): Promise<void> {
  const delayMs = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
  const nextAttempt = new Date(Date.now() + delayMs).toISOString();
  await database.run(
    `UPDATE outbox
     SET attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
     WHERE operation_id = ?`,
    [attempts + 1, nextAttempt, error, new Date().toISOString(), operationId],
  );
}

export async function markOperationConflict(
  operationId: string,
  error: string,
): Promise<void> {
  await database.run(
    `UPDATE outbox
     SET status = 'conflict', last_error = ?, updated_at = ?
     WHERE operation_id = ?`,
    [error, new Date().toISOString(), operationId],
  );
}

export async function clearUserOutbox(userId: string): Promise<void> {
  await database.run("DELETE FROM outbox WHERE user_id = ?", [userId]);
}
