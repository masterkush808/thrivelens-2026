import React, { useState, useEffect, useMemo } from "react";
import { PremiumScreen } from "@/components/brand/PremiumScreen";
import { View, ScrollView, Pressable, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Button } from "@/components/ui";
import { getTodayFoodSummary, getTodayFoodLogs } from "@/data/foodRepository";
import { getCurrentProfile } from "@/data/profileRepository";
import {
  getWorkoutCountSince,
  getWorkoutVolumeSince,
  getRecentWorkouts,
} from "@/data/workoutRepository";
import { getWeightTrend, logWeight } from "@/data/progressRepository";
import { FoodLog, ProgressLog, WorkoutSession } from "@/db";

const timeFilters = ["7D", "30D", "3M", "6M"];

function dayKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${
    d.getFullYear()
  }`;
}

export default function TrackingScreen() {
  const [selectedTime, setSelectedTime] = useState("7D");
  const [today, setToday] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  const [recentLogs, setRecentLogs] = useState<FoodLog[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [profile, setProfile] = useState<{
    weight: number | null;
    height: number | null;
    age: number | null;
    goal: string | null;
    calorie_target: number | null;
    protein_target: number | null;
  } | null>(null);
  const [workoutCount, setWorkoutCount] = useState(0);
  const [workoutVolume, setWorkoutVolume] = useState(0);
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutSession[]>([]);
  const [weightTrend, setWeightTrend] = useState<ProgressLog[]>([]);
  const [weightInput, setWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [summary, logs, currentProfile, workouts, trend] = await Promise.all([
          getTodayFoodSummary(),
          getTodayFoodLogs(),
          getCurrentProfile().catch(() => null),
          getRecentWorkouts(10).catch(() => []),
          getWeightTrend(20).catch(() => []),
        ]);
        if (!mounted) return;
        setToday(summary);
        setRecentLogs(logs);
        setTodayCount(logs.length);
        setRecentWorkouts(workouts);
        setWeightTrend(trend);
        setProfile({
          weight: currentProfile?.weight ?? null,
          height: currentProfile?.height ?? null,
          age: currentProfile?.age ?? null,
          goal: currentProfile?.goal ?? null,
          calorie_target: currentProfile?.calorie_target ?? null,
          protein_target: currentProfile?.protein_target ?? null,
        });
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (selectedTime === "7D" ? 7 : selectedTime === "30D" ? 30 : 90));
        const [count, volume] = await Promise.all([
          getWorkoutCountSince(start.getTime()),
          getWorkoutVolumeSince(start.getTime()),
        ]);
        if (!mounted) return;
        setWorkoutCount(count);
        setWorkoutVolume(volume);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [selectedTime]);

  const days = useMemo(() => {
    const now = new Date();
    const filterDays = selectedTime === "7D" ? 7 : selectedTime === "30D" ? 30 : 90;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (filterDays - 1)).getTime();
    const byDay = new Map<string, number>();
    const rows: { day: string; calories: number }[] = [];

    for (const log of recentLogs) {
      if (log.date < start) continue;
      const key = dayKey(log.date);
      byDay.set(key, (byDay.get(key) ?? 0) + log.calories);
    }

    for (let i = 0; i < filterDays; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (filterDays - 1 - i));
      rows.push({ day: dayKey(d.getTime()), calories: byDay.get(dayKey(d.getTime())) ?? 0 });
    }
    return rows;
  }, [selectedTime, recentLogs]);

  const maxCalories = Math.max(1, ...days.map((d) => d.calories));
  const totalCalories = days.reduce((sum, d) => sum + d.calories, 0);
  const activeDays = days.filter((d) => d.calories > 0).length;
  const averageCalories = activeDays > 0 ? Math.round(totalCalories / activeDays) : 0;

  const goal = profile?.goal ?? null;
  const calorieTarget = profile?.calorie_target ?? 2200;

  const stats = [
    { label: "Calories", value: today.calories.toLocaleString(), unit: "kcal", color: "text-accent" },
    { label: "Protein", value: today.protein.toLocaleString(), unit: "g", color: "text-primary" },
    { label: "Carbs", value: today.carbs.toLocaleString(), unit: "g", color: "text-warning" },
    { label: "Fat", value: today.fat.toLocaleString(), unit: "g", color: "text-success" },
  ];

  return (
    <PremiumScreen>
      <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="px-6 py-4">
            <Text variant="h1">Tracking</Text>
            <Text variant="body" className="text-text-secondary mt-1">
              Real progress from your logged meals
            </Text>
          </View>

          <View className="px-6 mb-6">
            <View className="flex-row bg-surface-elevated rounded-xl p-1">
              {timeFilters.map((time) => (
                <Pressable
                  key={time}
                  className={`flex-1 py-2 rounded-lg ${
                    selectedTime === time ? "bg-primary" : ""
                  }`}
                  onPress={() => setSelectedTime(time)}
                >
                  <Text
                    variant="bodySmall"
                    className={`text-center font-semibold ${
                      selectedTime === time ? "text-text-inverse" : "text-text-secondary"
                    }`}
                  >
                    {time}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {todayCount > 0 ? (
            <View className="px-6 mb-6">
              <Text variant="h3" className="mb-4">
                Today’s Nutrition
              </Text>
              <View className="flex-row flex-wrap gap-3">
                {stats.map((stat, index) => (
                  <Card key={index} variant="elevated" className="w-[48%]" style={{}}>
                    <Text variant="caption" className="text-text-tertiary mb-1">
                      {stat.label}
                    </Text>
                    <View className="flex-row items-baseline gap-1">
                      <Text variant="stat" className={stat.color}>
                        {stat.value}
                      </Text>
                      <Text variant="bodySmall" className="text-text-tertiary">
                        {stat.unit}
                      </Text>
                    </View>
                  </Card>
                ))}
              </View>
              {todayCount > 0 && (
                <Text variant="caption" className="text-text-tertiary mt-3">
                  {todayCount} food {todayCount === 1 ? "log" : "logs"} today
                </Text>
              )}
            </View>
          ) : (
            <View className="px-6 mb-6">
              <Text variant="h3" className="mb-2">
                Today’s Nutrition
              </Text>
              <Card variant="elevated">
                <Text variant="body" className="text-text-primary font-semibold">
                  No meals logged yet today
                </Text>
                <Text variant="bodySmall" className="text-text-secondary mt-2">
                  Track your first meal with the scanner and your daily numbers will appear here.
                </Text>
              </Card>
            </View>
          )}

          <View className="px-6 mb-6">
            <Text variant="h3" className="mb-4">
              Calories Last {selectedTime}
            </Text>
            <Card variant="elevated">
              <View className="flex-row items-end justify-between" style={{ height: 140 }}>
                {days.map((row) => {
                  const barH = (row.calories / maxCalories) * 120;
                  return (
                    <View key={row.day} className="flex-1 items-center">
                      <Text variant="caption" className="text-text-tertiary mb-1">
                        {row.calories > 0 ? Math.round(row.calories).toLocaleString() : ""}
                      </Text>
                      <View
                        className="w-4 rounded-t-md"
                        style={{
                          height: Math.max(barH, row.calories > 0 ? 4 : 2),
                          backgroundColor: row.calories > 0 ? "#FF6B35" : "#40382A",
                        }}
                      />
                      <Text variant="caption" className="text-text-tertiary mt-1">
                        {row.day.slice(5)}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <View className="flex-row justify-between mt-4 border-t border-border pt-3">
                <View className="items-center">
                  <Text variant="statSmall" className="text-accent">
                    {averageCalories.toLocaleString()}
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    Avg / active day
                  </Text>
                </View>
                <View className="items-center">
                  <Text variant="statSmall" className="text-primary">
                    {calorieTarget.toLocaleString()}
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    Target
                  </Text>
                </View>
                <View className="items-center">
                  <Text variant="statSmall" className="text-success">
                    {activeDays}
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    Days logged
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          <View className="px-6 mb-6">
            <Text variant="h3" className="mb-4">
              Your Profile
            </Text>
            <Card variant="elevated">
              <View className="flex-row flex-wrap gap-3">
                <View className="w-[30%]">
                  <Text variant="caption" className="text-text-tertiary mb-1">
                    Goal
                  </Text>
                  <Text variant="body" className="text-text-primary font-semibold">
                    {goal && goal.length > 0 ? goal : "Not set"}
                  </Text>
                </View>
                <View className="w-[22%]">
                  <Text variant="caption" className="text-text-tertiary mb-1">
                    Age
                  </Text>
                  <Text variant="body" className="text-text-primary font-semibold">
                    {profile?.age ?? "—"}
                  </Text>
                </View>
                <View className="w-[22%]">
                  <Text variant="caption" className="text-text-tertiary mb-1">
                    Height
                  </Text>
                  <Text variant="body" className="text-text-primary font-semibold">
                    {profile?.height ? `${profile.height} cm` : "—"}
                  </Text>
                </View>
                <View className="w-[22%]">
                  <Text variant="caption" className="text-text-tertiary mb-1">
                    Weight
                  </Text>
                  <Text variant="body" className="text-text-primary font-semibold">
                    {profile?.weight ? `${profile.weight} kg` : "—"}
                  </Text>
                </View>
              </View>
              <Text variant="bodySmall" className="text-text-secondary mt-4">
                Your latest weight comes from the weight trend you log above. Set
                height, gender and goals in your profile.
              </Text>
            </Card>
          </View>

          <View className="px-6 mb-6">
            <Text variant="h3" className="mb-4">
              Weight Trends
            </Text>
            <Card variant="elevated">
              <View className="flex-row justify-between mb-4">
                <View className="items-center">
                  <Text variant="stat" className="text-primary">
                    {weightTrend[0]?.weight ?? profile?.weight ?? "—"} kg
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    Latest
                  </Text>
                </View>
                <View className="items-center">
                  <Text variant="statSmall" className="text-success">
                    {weightTrend.length > 1 &&
                    (weightTrend[0].weight ?? 0) < (weightTrend[weightTrend.length - 1].weight ?? 0)
                      ? "▼"
                      : "▲"}{" "}
                    {weightTrend.length > 1
                      ? Math.abs(
                          (weightTrend[0].weight ?? 0) -
                            (weightTrend[weightTrend.length - 1].weight ?? 0),
                        ).toFixed(1)
                      : "0.0"} kg
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    Since first log
                  </Text>
                </View>
                <View className="items-center">
                  <Text variant="statSmall" className="text-accent">
                    {weightTrend.length}
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    Logs
                  </Text>
                </View>
              </View>

              {weightTrend.length > 0 ? (
                <View className="gap-1 mb-4">
                  {weightTrend.slice(0, 5).map((entry) => (
                    <View key={entry.id} className="flex-row justify-between border-b border-border/50 py-1">
                      <Text variant="bodySmall" className="text-text-secondary">
                        {dateLabel(entry.loggedAt)}
                      </Text>
                      <Text variant="bodySmall" className="text-text-primary font-semibold">
                        {entry.weight ?? "—"} kg
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text variant="bodySmall" className="text-text-secondary mb-4">
                  No weight logged yet. Enter your current weight below to start a real trend.
                </Text>
              )}

              <View className="flex-row items-center gap-3">
                <TextInput
                  className="flex-1 bg-surface-highlight rounded-xl px-4 py-3 text-text-primary"
                  value={weightInput}
                  onChangeText={(value) => setWeightInput(value.replace(/[^0-9.]/g, ""))}
                  keyboardType="numeric"
                  placeholder={`${profile?.weight ?? 0} kg`}
                  placeholderTextColor="#ABA291"
                />
                <Button
                  title={savingWeight ? "..." : "Log"}
                  size="md"
                  disabled={savingWeight}
                  onPress={() => {
                    const parsed = Number.parseFloat(weightInput);
                    if (!Number.isFinite(parsed) || parsed <= 0) {
                      Alert.alert("Invalid weight", "Enter your weight in kg.");
                      return;
                    }
                    setSavingWeight(true);
                    logWeight({ weightKg: parsed })
                      .then(async () => {
                        setWeightInput("");
                        const trend = await getWeightTrend(20);
                        const currentProfile = await getCurrentProfile();
                        setWeightTrend(trend);
                        setProfile((prev) => ({
                          ...(prev ?? { weight: null, height: null, age: null, goal: null, calorie_target: null, protein_target: null }),
                          weight: currentProfile?.weight ?? prev?.weight ?? null,
                        }));
                      })
                      .catch(() => Alert.alert("Could not save", "Logging your weight failed. Please retry."))
                      .finally(() => setSavingWeight(false));
                  }}
                />
              </View>
            </Card>
          </View>

          <View className="px-6 mb-6">
            <Text variant="h3" className="mb-4">
              Strength Progression
            </Text>
            <Card variant="elevated">
              {recentWorkouts.length > 0 ? (
                <>
                  <View className="flex-row justify-between mb-4">
                    <View className="items-center">
                      <Text variant="statSmall" className="text-primary">
                        {workoutCount}
                      </Text>
                      <Text variant="caption" className="text-text-tertiary">
                        Sessions ({selectedTime})
                      </Text>
                    </View>
                    <View className="items-center">
                      <Text variant="statSmall" className="text-success">
                        {Math.round(workoutVolume).toLocaleString()} kg
                      </Text>
                      <Text variant="caption" className="text-text-tertiary">
                        Total volume
                      </Text>
                    </View>
                  </View>
                  <View className="gap-1 mb-4">
                    {recentWorkouts.slice(0, 5).map((session) => (
                      <View key={session.id} className="flex-row justify-between border-b border-border/50 py-1">
                        <Text variant="bodySmall" className="text-text-secondary">
                          {dateLabel(session.createdAt)}
                        </Text>
                        <Text variant="bodySmall" className="text-text-primary font-semibold">
                          {Math.round(session.totalVolume ?? 0).toLocaleString()} kg moved
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <Text variant="body" className="text-text-primary font-semibold">
                  No strength data yet
                </Text>
              )}
              <Text variant="bodySmall" className="text-text-secondary mt-2">
                Every completed workout session feeds this chart automatically.
                Log one from the Workout tab to see it here.
              </Text>
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}