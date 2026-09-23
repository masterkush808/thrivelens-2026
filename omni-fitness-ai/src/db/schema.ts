import {
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  age: integer("age"),
  weight: real("weight"),
  height: real("height"),
  gender: text("gender"),
  goal: text("goal"),
  goalTimeline: text("goal_timeline"),
  activityLevel: text("activity_level"),
  experience: text("experience"),
  calorieTarget: integer("calorie_target"),
  proteinTarget: real("protein_target"),
  dietaryPreference: text("dietary_preference"),
  trainingDaysPerWeek: integer("training_days_per_week"),
  sessionDurationMinutes: integer("session_duration_minutes"),
  workoutLocation: text("workout_location"),
  workoutType: text("workout_type"),
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" })
    .notNull()
    .default(false),
  ...timestamps,
});

export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  bodyPart: text("body_part").notNull(),
  targetMuscle: text("target_muscle"),
  equipment: text("equipment"),
  difficulty: text("difficulty"),
  instructions: text("instructions"),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  createdAt: text("created_at").notNull(),
});

export const workoutPlans = sqliteTable("workout_plans", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  goal: text("goal"),
  daysPerWeek: integer("days_per_week").notNull().default(4),
  isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const workoutDays = sqliteTable("workout_days", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => workoutPlans.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  name: text("name").notNull(),
  focus: text("focus"),
});

export const workoutExercises = sqliteTable("workout_exercises", {
  id: text("id").primaryKey(),
  dayId: text("day_id").notNull().references(() => workoutDays.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id").notNull().references(() => exercises.id),
  sets: integer("sets").notNull().default(3),
  reps: text("reps").notNull().default("8-12"),
  restSeconds: integer("rest_seconds").notNull().default(90),
  order: integer("order").notNull().default(0),
  notes: text("notes"),
});

export const workoutSessions = sqliteTable("workout_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  planId: text("plan_id").references(() => workoutPlans.id, { onDelete: "set null" }),
  dayId: text("day_id").references(() => workoutDays.id, { onDelete: "set null" }),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  totalVolume: real("total_volume"),
  createdAt: text("created_at").notNull(),
});

export const workoutLogs = sqliteTable("workout_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id").notNull().references(() => exercises.id),
  sessionId: text("session_id").references(() => workoutSessions.id, { onDelete: "cascade" }),
  loggedAt: text("logged_at").notNull(),
  setsCompleted: integer("sets_completed").notNull().default(0),
  reps: text("reps"),
  weight: real("weight"),
  durationSeconds: integer("duration_seconds"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const foodLogs = sqliteTable("food_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  date: integer("date").notNull(),
  mealType: text("meal_type").notNull(),
  foodName: text("food_name").notNull(),
  calories: integer("calories").notNull().default(0),
  protein: real("protein").notNull().default(0),
  carbs: real("carbs").notNull().default(0),
  fat: real("fat").notNull().default(0),
  fiber: real("fiber"),
  imageUri: text("image_uri"),
  amountGrams: real("amount_grams"),
  aiConfidence: real("ai_confidence"),
  aiModelVersion: text("ai_model_version"),
  nutrientSource: text("nutrient_source"),
  createdAt: integer("created_at").notNull(),
});

export type FoodLog = typeof foodLogs.$inferSelect;
export type NewFoodLog = typeof foodLogs.$inferInsert;

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;

export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type NewWorkoutSession = typeof workoutSessions.$inferInsert;

export type WorkoutLog = typeof workoutLogs.$inferSelect;
export type NewWorkoutLog = typeof workoutLogs.$inferInsert;

export type ProgressLog = typeof progressLogs.$inferSelect;
export type NewProgressLog = typeof progressLogs.$inferInsert;

export const progressLogs = sqliteTable("progress_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  loggedAt: text("logged_at").notNull(),
  weight: real("weight"),
  bodyFat: real("body_fat"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull().default("workout_reminder"),
  scheduledAt: text("scheduled_at").notNull(),
  sent: integer("sent", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const fridgeItems = sqliteTable("fridge_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category"),
  quantity: real("quantity"),
  unit: text("unit"),
  addedDate: text("added_date").notNull(),
  expiryDate: text("expiry_date"),
  used: integer("used", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const mealPlans = sqliteTable("meal_plans", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  weekStart: text("week_start").notNull(),
  goal: text("goal"),
  planJson: text("plan_json").notNull(),
  groceryListJson: text("grocery_list_json").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const cheatDays = sqliteTable("cheat_days", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  reason: text("reason"),
  createdAt: text("created_at").notNull(),
});

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  planId: text("plan_id"),
  kind: text("kind").notNull().default("meal_prep"),
  title: text("title").notNull(),
  scheduledFor: text("scheduled_for").notNull(),
  detailJson: text("detail_json"),
  status: text("status").notNull().default("scheduled"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type FridgeItem = typeof fridgeItems.$inferSelect;
export type NewFridgeItem = typeof fridgeItems.$inferInsert;
export type MealPlan = typeof mealPlans.$inferSelect;
export type NewMealPlan = typeof mealPlans.$inferInsert;
export type CheatDay = typeof cheatDays.$inferSelect;
export type NewCheatDay = typeof cheatDays.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
