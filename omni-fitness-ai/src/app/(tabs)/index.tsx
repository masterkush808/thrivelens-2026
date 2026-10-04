import React, { useCallback, useEffect, useMemo, useState } from "react";
import { InspirationCard } from "@/components/brand/InspirationCard";
import { PremiumScreen } from "@/components/brand/PremiumScreen";
import { Pressable, View, ScrollView } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  FadeInDown,
  Easing,
} from "react-native-reanimated";
import {
  Text,
  Button,
  Card,
  Avatar,
  ProgressBar,
  AIRecommendationCard,
  PressableScale,
} from "@/components/ui";
import { getCurrentProfile, Profile } from "@/data/profileRepository";
import { getTodayFoodSummary, FoodSummary } from "@/data/foodRepository";
import {
  getRecentWorkouts,
  getWorkoutCountSince,
  getWorkoutVolumeSince,
} from "@/data/workoutRepository";
import { formatVolume } from "@/data/workoutMetrics";
import { WorkoutSession, latestCheatDay } from "@/db";
import { buildAdherenceSnapshot } from "@/data/adherenceRepo";
import { currentUserId } from "@/lib/auth";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

const DEFAULT_TARGETS = {
  calories: 2200,
  protein: 165,
  carbs: 275,
  fat: 73,
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export default function HomeScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [foodSummary, setFoodSummary] = useState<FoodSummary>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  });
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutSession[]>([]);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [weeklyVolume, setWeeklyVolume] = useState(0);
  const scrollY = useSharedValue(0);

  const [cheatDayAvailable, setCheatDayAvailable] = useState(false);
  const [cheatDayDismissed, setCheatDayDismissed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        try {
          const userId = await currentUserId();
          if (!userId) {
            if (alive) setCheatDayAvailable(false);
            return;
          }
          const [adherence, lastCheat] = await Promise.all([
            buildAdherenceSnapshot(userId),
            latestCheatDay(userId),
          ]);
          const now = new Date();
          const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
          const usedThisMonth = (lastCheat?.date ?? "").slice(0, 7) === monthPrefix;
          if (alive) {
            setCheatDayAvailable(Boolean(adherence?.cheat_day_eligible && !usedThisMonth));
          }
        } catch {
          if (alive) setCheatDayAvailable(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  useEffect(() => {
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);
    Promise.all([
      getCurrentProfile(),
      getTodayFoodSummary(),
      getRecentWorkouts(5),
      getWorkoutCountSince(weekStart.getTime()),
      getWorkoutVolumeSince(weekStart.getTime()),
    ])
      .then(([nextProfile, nextSummary, workouts, count, volume]) => {
        setProfile(nextProfile);
        setFoodSummary(nextSummary);
        setRecentWorkouts(workouts);
        setWeeklyWorkouts(count);
        setWeeklyVolume(volume);
      })
      .catch(() => undefined);
  }, []);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [0, 60], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.get(), [0, 60], [0, -12], Extrapolation.CLAMP) },
    ],
  }));

  const user = {
    name: profile?.display_name?.split(" ")[0] ?? "there",
    greeting: getGreeting(),
  };

  const targets = {
    calories: profile?.calorie_target ?? DEFAULT_TARGETS.calories,
    protein: profile?.protein_target ?? DEFAULT_TARGETS.protein,
    carbs: DEFAULT_TARGETS.carbs,
    fat: DEFAULT_TARGETS.fat,
  };

  const nutrition = {
    calories: { consumed: Math.round(foodSummary.calories), target: targets.calories },
    protein: { consumed: Math.round(foodSummary.protein), target: targets.protein },
    carbs: { consumed: Math.round(foodSummary.carbs), target: targets.carbs },
    fat: { consumed: Math.round(foodSummary.fat), target: targets.fat },
  };

  const proteinRemaining = targets.protein - foodSummary.protein;
  const coachMessage =
    proteinRemaining > 0
      ? `You're ${Math.round(proteinRemaining)}g short of your protein goal today (${
          nutrition.protein.consumed
        }g of ${targets.protein}g logged). Ask the coach for a meal that fits your remaining calories.`
      : `You've hit your protein goal today. Ask the coach for a balanced meal to round out your day.`;

  const hasFoodToday = foodSummary.calories > 0;

  const enteringWorkout = useMemo(() => FadeInDown.duration(500).delay(100).easing(EASE_OUT), []);
  const enteringNutrition = useMemo(() => FadeInDown.duration(500).delay(200).easing(EASE_OUT), []);
  const enteringAI = useMemo(() => FadeInDown.duration(500).delay(300).easing(EASE_OUT), []);
  const enteringActions = useMemo(() => FadeInDown.duration(500).delay(400).easing(EASE_OUT), []);
  const enteringRecent = useMemo(() => FadeInDown.duration(500).delay(500).easing(EASE_OUT), []);
  const enteringWeekly = useMemo(() => FadeInDown.duration(500).delay(600).easing(EASE_OUT), []);

  return (
    <PremiumScreen>
      <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
        <AnimatedScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View style={headerStyle} className="flex-row justify-between items-center px-6 py-4">
            <View>
              <Text variant="bodySmall" className="text-text-secondary">
                {user.greeting}
              </Text>
              <Text variant="h2">{user.name}</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <PressableScale onPress={() => router.push("/profile")}>
                <Avatar initials={(profile?.display_name?.[0] ?? "U").toUpperCase()} uri={profile?.avatar_url ?? undefined} size="md" />
              </PressableScale>
            </View>
          </Animated.View>

          <View className="px-6 mb-6">
          <InspirationCard compact />
        </View>

        {/* Today's Workout Hero */}
          <Animated.View entering={enteringWorkout} className="px-6 mb-6">
            <Card variant="elevated">
              <Text variant="bodySmall" className="text-text-secondary mb-2">
                Today’s Workout
              </Text>
              <Text variant="h2" className="mb-3">
                Start a session
              </Text>
              <Text variant="body" className="text-text-secondary mb-4 leading-5">
                Build today’s workout from the exercise catalog and save it — it
                lands in your real workout history and strength tracking instantly.
              </Text>
              <Button
                title="Log a Workout"
                size="lg"
                onPress={() => router.push("/workout-logger")}
              />
            </Card>
          </Animated.View>

          {/* Nutrition Summary */}
          <Animated.View entering={enteringNutrition} className="px-6 mb-6">
            <Card variant="elevated">
              <View className="flex-row justify-between items-center mb-4">
                <Text variant="h3">Today’s Nutrition</Text>
                <PressableScale onPress={() => router.push("/(tabs)/nutrition")}>
                  <Text variant="bodySmall" className="text-primary">
                    View All
                  </Text>
                </PressableScale>
              </View>

              {!hasFoodToday && (
                <Text variant="bodySmall" className="text-text-tertiary mb-4 leading-5">
                  Nothing logged yet today. Scan a meal to start tracking.
                </Text>
              )}

              {/* Calories */}
              <View className="mb-4">
                <View className="flex-row justify-between mb-2">
                  <Text variant="body" className="text-text-secondary">
                    Calories
                  </Text>
                  <Text variant="body" className="text-text-primary">
                    {nutrition.calories.consumed} / {nutrition.calories.target} kcal
                  </Text>
                </View>
                <ProgressBar
                  progress={(nutrition.calories.consumed / nutrition.calories.target) * 100}
                  color="#FF6B35"
                />
              </View>

              {/* Macros */}
              <View className="flex-row justify-between">
                <View className="flex-1 items-center">
                  <Text variant="caption" className="text-text-tertiary mb-1">
                    Protein
                  </Text>
                  <Text variant="statSmall" className="text-primary">
                    {nutrition.protein.consumed}g
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    / {nutrition.protein.target}g
                  </Text>
                </View>
                <View className="flex-1 items-center">
                  <Text variant="caption" className="text-text-tertiary mb-1">
                    Carbs
                  </Text>
                  <Text variant="statSmall" className="text-success">
                    {nutrition.carbs.consumed}g
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    / {nutrition.carbs.target}g
                  </Text>
                </View>
                <View className="flex-1 items-center">
                  <Text variant="caption" className="text-text-tertiary mb-1">
                    Fat
                  </Text>
                  <Text variant="statSmall" className="text-warning">
                    {nutrition.fat.consumed}g
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    / {nutrition.fat.target}g
                  </Text>
                </View>
              </View>
            </Card>
          </Animated.View>

          {/* AI Coach Card */}
          <Animated.View entering={enteringAI} className="px-6 mb-6">
            <AIRecommendationCard
              title="Thrive Lens AI"
              message={coachMessage}
              actionLabel="Ask the Coach"
              onAction={() => router.push("/ai-coach")}
            />
          </Animated.View>

          {/* Cheat Day Celebration */}
          {cheatDayAvailable && !cheatDayDismissed && (
            <Animated.View entering={FadeInDown} className="px-6 mb-6">
              <Card variant="elevated">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text variant="h3" className="text-success mb-1">
                      Cheat day unlocked!
                    </Text>
                    <Text variant="bodySmall" className="text-text-secondary mb-3">
                      You earned your monthly reward day by staying consistent.
                    </Text>
                    <Button
                      title="Celebrate"
                      size="sm"
                      className="self-start"
                      onPress={() => router.push("/cheat-day")}
                    />
                  </View>
                  <Pressable
                    onPress={() => setCheatDayDismissed(true)}
                    hitSlop={8}
                    accessibilityLabel="Dismiss cheat day celebration"
                  >
                    <X size={18} color="#ABA291" />
                  </Pressable>
                </View>
              </Card>
            </Animated.View>
          )}

          {/* Quick Actions */}
          <Animated.View entering={enteringActions} className="px-6 mb-6">
            <Text variant="h3" className="mb-4">
              Quick Actions
            </Text>
            <View className="flex-row gap-3">
              <PressableScale
                className="flex-1 bg-surface p-4 rounded-xl items-center"
                onPress={() => router.push("/food-scanner")}
              >
                <Text variant="h2" className="mb-2">
                  📷
                </Text>
                <Text variant="bodySmall" className="text-text-secondary text-center">
                  Scan Food
                </Text>
              </PressableScale>
              <PressableScale
                className="flex-1 bg-surface p-4 rounded-xl items-center"
                onPress={() => router.push("/ai-coach")}
              >
                <Text variant="h2" className="mb-2">
                  🤖
                </Text>
                <Text variant="bodySmall" className="text-text-secondary text-center">
                  AI Coach
                </Text>
              </PressableScale>
              <PressableScale
                className="flex-1 bg-surface p-4 rounded-xl items-center"
                onPress={() => router.push("/(tabs)/workout")}
              >
                <Text variant="h2" className="mb-2">
                  💪
                </Text>
                <Text variant="bodySmall" className="text-text-secondary text-center">
                  Workouts
                </Text>
              </PressableScale>
            </View>
          </Animated.View>

          {/* Recent Workouts */}
          <Animated.View entering={enteringRecent} className="px-6 mb-6">
            <View className="flex-row justify-between items-center mb-4">
              <Text variant="h3">Recent Workouts</Text>
              <PressableScale onPress={() => router.push("/(tabs)/workout")}>
                <Text variant="bodySmall" className="text-primary">
                  View All
                </Text>
              </PressableScale>
            </View>
            {recentWorkouts.length > 0 ? (
              <Card variant="elevated">
                <View className="gap-1">
                  {recentWorkouts.map((session) => (
                    <View
                      key={session.id}
                      className="flex-row justify-between border-b border-border/50 py-2 last:border-b-0"
                    >
                      <Text variant="bodySmall" className="text-text-secondary">
                        {dateLabel(session.completedAt)}
                      </Text>
                      <Text variant="bodySmall" className="text-text-primary font-semibold">
                        {formatVolume(session.totalVolume ?? 0)} moved
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            ) : (
              <Card variant="elevated">
                <Text variant="bodySmall" className="text-text-tertiary leading-5">
                  No workouts logged yet. When you complete a session it will appear
                  here.
                </Text>
              </Card>
            )}
          </Animated.View>

          {/* Weekly Progress */}
          <Animated.View entering={enteringWeekly} className="px-6 mb-6">
            <Text variant="h3" className="mb-4">
              This Week
            </Text>
            <Card variant="elevated">
              <View className="flex-row justify-between mb-4">
                <View className="items-center">
                  <Text variant="statSmall" className="text-primary">
                    {weeklyWorkouts}
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    Workouts
                  </Text>
                </View>
                <View className="items-center">
                  <Text variant="statSmall" className="text-success">
                    {formatVolume(weeklyVolume)}
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    Volume moved
                  </Text>
                </View>
                <View className="items-center">
                  <Text variant="statSmall" className="text-accent">
                    {Math.round(foodSummary.calories).toLocaleString()} kcal
                  </Text>
                  <Text variant="caption" className="text-text-tertiary">
                    Food today
                  </Text>
                </View>
              </View>
              <ProgressBar
                progress={Math.min((foodSummary.calories / targets.calories) * 100, 100)}
                color="#E7BE73"
                showLabel
                label={hasFoodToday ? "Calories today" : "No meals logged yet"}
              />
            </Card>
          </Animated.View>
        </AnimatedScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}