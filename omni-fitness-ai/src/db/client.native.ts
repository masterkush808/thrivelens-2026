import * as SQLite from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";

import { SCHEMA_SQL } from "./schemaSql";
import * as schema from "./schema";

export const sqlite = SQLite.openDatabaseSync("thrivelens.db");

/**
 * Applies the schema. Safe to call repeatedly; every statement is
 * `IF NOT EXISTS`.
 */
export function ensureSchema(): void {
  sqlite.execSync(SCHEMA_SQL);
}

ensureSchema();

export const database = sqlite;
export const db = drizzle(sqlite, { schema });
