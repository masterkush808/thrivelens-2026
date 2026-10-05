/**
 * Type surface for the platform-split database client.
 *
 * Metro resolves `./client` to `client.native.ts` (iOS/Android, synchronous
 * expo-sqlite + drizzle's expo-sqlite driver) or `client.web.ts` (browser,
 * `openDatabaseAsync` + drizzle's sqlite-proxy driver). TypeScript needs this
 * declaration to resolve the extensionless import.
 *
 * `db` is typed as the async proxy database. The repositories already `await`
 * every query, and awaiting a synchronous drizzle result is valid, so the native
 * client satisfies this shape too.
 *
 * Web has no synchronous SQLite: expo-sqlite's web sync API needs
 * SharedArrayBuffer, which browsers only expose to cross-origin-isolated
 * documents. See client.web.ts for the full explanation.
 *
 * Types-only; never bundled.
 */
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

import type * as schema from "./schema";

export declare const db: SqliteRemoteDatabase<typeof schema>;

export declare const database: {
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

/** Resolves once the schema has been applied. */
export declare function ensureSchema(): Promise<void>;

export declare const sqlite: unknown;
