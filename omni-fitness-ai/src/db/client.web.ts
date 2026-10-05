import * as SQLite from "expo-sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import type { AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";

import { SCHEMA_SQL } from "./schemaSql";
import * as schema from "./schema";

/**
 * Web database client.
 *
 * Why this is not the same file as the native client: expo-sqlite's *sync* API
 * on web is implemented in `web/WorkerChannel.ts`, which allocates
 * `new SharedArrayBuffer(...)` to hand a lock and a result slot to its WASM
 * worker. Browsers only expose SharedArrayBuffer to cross-origin-isolated
 * documents, which require COOP/COEP response headers. EAS Hosting sends
 * neither, so the identifier is undefined and `openDatabaseSync`/`execSync`
 * threw `ReferenceError: SharedArrayBuffer is not defined` while the module was
 * still evaluating - before React ever rendered. That is what made the whole
 * installed PWA show a black screen on every screen.
 *
 * The async API posts messages to the worker instead and needs no shared
 * memory, so this client is built on `openDatabaseAsync` and exposed to drizzle
 * through the `sqlite-proxy` driver.
 */

let openPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!openPromise) {
    openPromise = SQLite.openDatabaseAsync("thrivelens.db");
  }
  return openPromise;
}

let schemaPromise: Promise<void> | null = null;

/**
 * Applies the schema once per session. Safe to call repeatedly: the underlying
 * promise is memoised and every statement is `IF NOT EXISTS`.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = openDatabase().then((database) => database.execAsync(SCHEMA_SQL));
    // Repositories call `ensureSchema()` at module scope purely to kick it off.
    // Swallow the rejection here so that fire-and-forget call cannot surface as
    // an unhandled rejection; the stored promise still rejects for real callers.
    void schemaPromise.catch(() => undefined);
  }
  return schemaPromise;
}

/** Minimal async surface the repositories use, independent of the driver. */
export const database = {
  async run(sql: string, params: unknown[] = []): Promise<void> {
    await ensureSchema();
    const handle = await openDatabase();
    await handle.runAsync(sql, params as SQLite.SQLiteBindParams);
  },
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    await ensureSchema();
    const handle = await openDatabase();
    return handle.getAllAsync<T>(sql, params as SQLite.SQLiteBindParams);
  },
};

const remote: AsyncRemoteCallback = async (sql, params, method) => {
  await ensureSchema();
  const handle = await openDatabase();

  if (method === "run") {
    await handle.runAsync(sql, params as SQLite.SQLiteBindParams);
    return { rows: [] };
  }

  const statement = await handle.prepareAsync(sql);
  try {
    if (method === "get") {
      const row = await statement.executeAsync(
        params as SQLite.SQLiteBindParams,
      );
      const first = await row.getFirstAsync();
      // drizzle's proxy driver reads `.rows` and treats a `get` as a single row.
      return { rows: (first ?? undefined) as unknown as unknown[] };
    }
    if (method === "values") {
      const result = await statement.executeAsync(
        params as SQLite.SQLiteBindParams,
      );
      return { rows: (await result.getAllAsync()) as unknown as unknown[] };
    }
    const result = await statement.executeAsync(params as SQLite.SQLiteBindParams);
    return { rows: (await result.getAllAsync()) as unknown as unknown[] };
  } finally {
    await statement.finalizeAsync();
  }
};

export const db = drizzle(remote, { schema });

/** Handle for callers that need the raw expo-sqlite database on web. */
export const sqlite = {
  get handle(): Promise<SQLite.SQLiteDatabase> {
    return ensureSchema().then(() => openDatabase());
  },
};
