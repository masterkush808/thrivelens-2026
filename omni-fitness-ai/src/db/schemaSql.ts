/**
 * Shared schema DDL for the local SQLite store.
 *
 * Kept in its own module so the native and web clients can both apply it
 * without duplicating the statements.
 */
export const SCHEMA_SQL = `
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS food_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,
      date INTEGER NOT NULL,
      meal_type TEXT NOT NULL,
      food_name TEXT NOT NULL,
      calories INTEGER NOT NULL DEFAULT 0,
      protein REAL NOT NULL DEFAULT 0,
      carbs REAL NOT NULL DEFAULT 0,
      fat REAL NOT NULL DEFAULT 0,
      fiber REAL,
      image_uri TEXT,
      amount_grams REAL,
      ai_confidence REAL,
      ai_model_version TEXT,
      nutrient_source TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS outbox (
      operation_id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      base_version TEXT,
      deleted_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS outbox_ready_idx
      ON outbox(user_id, status, next_attempt_at);

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      body_part TEXT NOT NULL,
      target_muscle TEXT,
      equipment TEXT,
      difficulty TEXT,
      instructions TEXT,
      image_url TEXT,
      video_url TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workout_plans (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      goal TEXT,
      days_per_week INTEGER NOT NULL DEFAULT 4,
      is_custom INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workout_days (
      id TEXT PRIMARY KEY NOT NULL,
      plan_id TEXT NOT NULL,
      day_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      focus TEXT
    );
    CREATE TABLE IF NOT EXISTS workout_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      day_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      sets INTEGER NOT NULL DEFAULT 3,
      reps TEXT NOT NULL DEFAULT '8-12',
      rest_seconds INTEGER NOT NULL DEFAULT 90,
      "order" INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      plan_id TEXT,
      day_id TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      total_volume REAL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS workout_sessions_user_idx
      ON workout_sessions(user_id, created_at);
    CREATE TABLE IF NOT EXISTS workout_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      session_id TEXT,
      logged_at TEXT NOT NULL,
      sets_completed INTEGER NOT NULL DEFAULT 0,
      reps TEXT,
      weight REAL,
      duration_seconds INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS workout_logs_user_idx
      ON workout_logs(user_id, logged_at);
    CREATE TABLE IF NOT EXISTS progress_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      logged_at TEXT NOT NULL,
      weight REAL,
      body_fat REAL,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS progress_logs_user_idx
      ON progress_logs(user_id, logged_at);
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'workout_reminder',
      scheduled_at TEXT NOT NULL,
      sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fridge_items (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      quantity REAL,
      unit TEXT,
      added_date TEXT NOT NULL,
      expiry_date TEXT,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS fridge_items_user_idx
      ON fridge_items(user_id, used);
    CREATE TABLE IF NOT EXISTS meal_plans (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      goal TEXT,
      plan_json TEXT NOT NULL,
      grocery_list_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS meal_plans_user_idx
      ON meal_plans(user_id, is_active);
    CREATE TABLE IF NOT EXISTS cheat_days (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cheat_days_user_idx
      ON cheat_days(user_id, date);
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      plan_id TEXT,
      kind TEXT NOT NULL DEFAULT 'meal_prep',
      title TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      detail_json TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS schedules_user_idx
      ON schedules(user_id, status, scheduled_for);
`;
