# Offline conflict behavior

Offline writes are placed in the local SQLite `outbox` with a stable operation ID. Replaying
the same operation is idempotent: profile updates are scoped to the authenticated user and
food log writes use the record ID as the upsert conflict key.

Transient failures remain pending and retry with exponential backoff. A server conflict
(HTTP 409/412 or an explicit conflict error) is retained with `status = 'conflict'` and is
not silently overwritten or retried forever. The UI must surface these records when conflict
resolution is added. Deletes are represented by `deleted_at` in the outbox payload so future
repositories can propagate tombstones instead of resurrecting deleted rows.

The server is authoritative after a successful replay. Signing out removes the current
account's local profile cache and outbox, preventing another account on the same device from
seeing or replaying those operations.
