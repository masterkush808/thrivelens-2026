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

export function enqueueOperation(input: OutboxOperation) {
  const now = new Date().toISOString();
  database.runSync(
    `INSERT INTO outbox (
      operation_id, user_id, entity, operation, payload, status,
      attempts, next_attempt_at, base_version, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?)
    ON CONFLICT(operation_id) DO NOTHING`,
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
  );
}

export function listReadyOperations(userId: string, now = new Date().toISOString()) {
  return database.getAllSync<{
    operation_id: string;
    entity: string;
    operation: "upsert" | "delete";
    payload: string;
    attempts: number;
    base_version: string | null;
    deleted_at: string | null;
  }>(
    `SELECT operation_id, entity, operation, payload, attempts, base_version, deleted_at
     FROM outbox
     WHERE user_id = ? AND status = 'pending' AND next_attempt_at <= ?
     ORDER BY created_at ASC`,
    userId,
    now,
  );
}

export function markOperationSucceeded(operationId: string) {
  database.runSync("DELETE FROM outbox WHERE operation_id = ?", operationId);
}

export function markOperationFailed(operationId: string, attempts: number, error: string) {
  const delayMs = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
  const nextAttempt = new Date(Date.now() + delayMs).toISOString();
  database.runSync(
    `UPDATE outbox
     SET attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
     WHERE operation_id = ?`,
    attempts + 1,
    nextAttempt,
    error,
    new Date().toISOString(),
    operationId,
  );
}

export function markOperationConflict(operationId: string, error: string) {
  database.runSync(
    `UPDATE outbox
     SET status = 'conflict', last_error = ?, updated_at = ?
     WHERE operation_id = ?`,
    error,
    new Date().toISOString(),
    operationId,
  );
}

export function clearUserOutbox(userId: string) {
  database.runSync("DELETE FROM outbox WHERE user_id = ?", userId);
}
