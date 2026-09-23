import React, { useEffect, useMemo, useState } from "react";
import { PremiumScreen } from "@/components/brand/PremiumScreen";
import { View, ScrollView } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown, Easing } from "react-native-reanimated";
import {
  Camera,
  ClipboardList,
  CookingPot,
  Sun,
  UtensilsCrossed,
  Moon,
  Cookie,
  Plus,
  Check,
  Flame,
  Droplets,
  Wheat,
  CircleDot,
} from "lucide-react-native";
import { Text, Card, CircularProgress, PressableScale } from "@/components/ui";
import { FoodLog } from "@/db";
import { getCurrentProfile, Profile } from "@/data/profileRepository";
import { getTodayFoodLogs, getTodayFoodSummary, FoodSummary } from "@/data/foodRepository";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const MEAL_META: { id: string; title: string; icon: typeof Sun; color: string }[] = [
  { id: "breakfast", title: "Breakfast", icon: Sun, color: "#FFD93D" },
  { id: "lunch", title: "Lunch", icon: UtensilsCrossed, color: "#FF6B35" },
  { id: "dinner", title: "Dinner", icon: Moon, color: "#A78BFA" },
  { id: "snack", title: "Snacks", icon: Cookie, color: "#34D399" },
];

const DEFAULT_TARGETS = {
  calories: 2200,
  protein: 165,
  carbs: 275,
  fat: 73,
};

export default function NutritionScreen() {
  const [summary, setSummary] = useState<FoodSummary>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  });
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    Promise.all([getTodayFoodSummary(), getTodayFoodLogs(), getCurrentProfile()])
      .then(([nextSummary, nextLogs, nextProfile]) => {
        setSummary(nextSummary);
        setLogs(nextLogs);
        setProfile(nextProfile);
      })
      .catch(() => undefined);
  }, []);

  const targets = {
    calories: profile?.calorie_target ?? DEFAULT_TARGETS.calories,
    protein: profile?.protein_target ?? DEFAULT_TARGETS.protein,
    carbs: DEFAULT_TARGETS.carbs,
    fat: DEFAULT_TARGETS.fat,
  };

  const meals = useMemo(
    () =>
      MEAL_META.map((meta) => {
        const mealLogs = logs.filter((log) => log.mealType === meta.id);
        return {
          ...meta,
          calories: mealLogs.reduce((sum, log) => sum + log.calories, 0),
          protein: mealLogs.reduce((sum, log) => sum + log.protein, 0),
          count: mealLogs.length,
        };
      }),
    [logs],
  );

  const enteringHeader = useMemo(() => FadeInDown.duration(500).delay(0).easing(EASE_OUT), []);
  const enteringOverview = useMemo(() => FadeInDown.duration(500).delay(100).easing(EASE_OUT), []);
  const enteringActions = useMemo(() => FadeInDown.duration(500).delay(200).easing(EASE_OUT), []);
  const enteringMeals = useMemo(() => FadeInDown.duration(500).delay(300).easing(EASE_OUT), []);
  const enteringTotal = useMemo(() => FadeInDown.duration(500).delay(400).easing(EASE_OUT), []);

  return (
    <PremiumScreen>
      <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={enteringHeader} className="px-6 py-4">
            <Text variant="h1">Nutrition</Text>
            <Text variant="body" className="text-text-secondary mt-1">
              Track your daily nutrition
            </Text>
          </Animated.View>

          {/* Nutrition Overview */}
          <Animated.View entering={enteringOverview} className="px-6 mb-6">
            <Card variant="elevated">
              <Text variant="h3" className="mb-4">
                Today’s Target
              </Text>
              <View className="flex-row justify-between">
                <CircularProgress
                  value={summary.calories}
                  maxValue={targets.calories}
                  color="#FF6B35"
                  size={80}
                  strokeWidth={8}
                  label="Calories"
                />
                <CircularProgress
                  value={summary.protein}
                  maxValue={targets.protein}
                  color="#E7BE73"
                  size={80}
                  strokeWidth={8}
                  label="Protein"
                />
                <CircularProgress
                  value={summary.carbs}
                  maxValue={targets.carbs}
                  color="#34C759"
                  size={80}
                  strokeWidth={8}
                  label="Carbs"
                />
                <CircularProgress
                  value={summary.fat}
                  maxValue={targets.fat}
                  color="#FF9500"
                  size={80}
                  strokeWidth={8}
                  label="Fat"
                />
              </View>
            </Card>
          </Animated.View>

          {/* Quick Actions */}
          <Animated.View entering={enteringActions} className="px-6 mb-6">
            <View className="flex-row gap-3">
              <PressableScale
                className="flex-1 bg-surface p-4 rounded-xl items-center"
                onPress={() => router.push("/food-scanner")}
              >
                <View className="w-12 h-12 rounded-full bg-accent/20 items-center justify-center mb-3">
                  <Camera size={24} color="#F5DCA7" />
                </View>
                <Text variant="bodySmall" className="text-text-secondary text-center">
                  Scan Food
                </Text>
              </PressableScale>
              <PressableScale
                className="flex-1 bg-surface p-4 rounded-xl items-center"
                onPress={() => router.push("/meal-plans")}
              >
                <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center mb-3">
                  <ClipboardList size={24} color="#E7BE73" />
                </View>
                <Text variant="bodySmall" className="text-text-secondary text-center">
                  Meal Plans
                </Text>
              </PressableScale>
              <PressableScale
                className="flex-1 bg-surface p-4 rounded-xl items-center"
                onPress={() => router.push("/fridge")}
              >
                <View className="w-12 h-12 rounded-full bg-success/20 items-center justify-center mb-3">
                  <CookingPot size={24} color="#34C759" />
                </View>
                <Text variant="bodySmall" className="text-text-secondary text-center">
                  My Kitchen
                </Text>
              </PressableScale>
            </View>
          </Animated.View>

          {/* Meal Tracker */}
          <Animated.View entering={enteringMeals} className="px-6 mb-6">
            <Text variant="h3" className="mb-4">
              Meal Tracker
            </Text>
            <View className="gap-3">
              {meals.map((meal) => {
                const MealIcon = meal.icon;
                return (
                  <PressableScale
                    key={meal.id}
                    onPress={() => router.push("/food-scanner")}
                  >
                    <Card variant="elevated">
                      <View className="flex-row items-center">
                        <View
                          className="w-12 h-12 rounded-xl items-center justify-center mr-4"
                          style={{ backgroundColor: `${meal.color}20` }}
                        >
                          <MealIcon size={22} color={meal.color} />
                        </View>

                        <View className="flex-1">
                          <Text variant="body" className="font-semibold">
                            {meal.title}
                          </Text>
                          {meal.count > 0 ? (
                            <Text variant="bodySmall" className="text-text-secondary mt-0.5">
                              {meal.calories} kcal · {meal.protein}g protein · {meal.count} item
                              {meal.count === 1 ? "" : "s"}
                            </Text>
                          ) : (
                            <Text variant="bodySmall" className="text-text-tertiary mt-0.5">
                              No meals logged
                            </Text>
                          )}
                        </View>

                        {meal.count > 0 ? (
                          <View className="w-8 h-8 rounded-full bg-success/20 items-center justify-center">
                            <Check size={16} color="#34C759" />
                          </View>
                        ) : (
                          <View className="bg-primary/20 px-4 py-2 rounded-full flex-row items-center gap-1.5">
                            <Plus size={14} color="#E7BE73" />
                            <Text variant="bodySmall" className="text-primary font-medium">
                              Add
                            </Text>
                          </View>
                        )}
                      </View>
                    </Card>
                  </PressableScale>
                );
              })}
            </View>
          </Animated.View>

          {/* Daily Total */}
          <Animated.View entering={enteringTotal} className="px-6 mb-6">
            <Card variant="elevated">
              <Text variant="h3" className="mb-4">
                Daily Total
              </Text>
              <View className="flex-row justify-between">
                <View className="items-center flex-1">
                  <View className="w-10 h-10 rounded-full bg-accent/20 items-center justify-center mb-2">
                    <Flame size={20} color="#FF6B35" />
                  </View>
                  <Text variant="statSmall" className="text-accent">
                    {summary.calories.toLocaleString()}
                  </Text>
                  <Text variant="caption" className="text-text-tertiary mt-1">
                    Calories
                  </Text>
                </View>
                <View className="items-center flex-1">
                  <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center mb-2">
                    <CircleDot size={20} color="#E7BE73" />
                  </View>
                  <Text variant="statSmall" className="text-primary">
                    {Math.round(summary.protein)}g
                  </Text>
                  <Text variant="caption" className="text-text-tertiary mt-1">
                    Protein
                  </Text>
                </View>
                <View className="items-center flex-1">
                  <View className="w-10 h-10 rounded-full bg-success/20 items-center justify-center mb-2">
                    <Wheat size={20} color="#34C759" />
                  </View>
                  <Text variant="statSmall" className="text-success">
                    {Math.round(summary.carbs)}g
                  </Text>
                  <Text variant="caption" className="text-text-tertiary mt-1">
                    Carbs
                  </Text>
                </View>
                <View className="items-center flex-1">
                  <View className="w-10 h-10 rounded-full bg-warning/20 items-center justify-center mb-2">
                    <Droplets size={20} color="#FF9500" />
                  </View>
                  <Text variant="statSmall" className="text-warning">
                    {Math.round(summary.fat)}g
                  </Text>
                  <Text variant="caption" className="text-text-tertiary mt-1">
                    Fat
                  </Text>
                </View>
              </View>
            </Card>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}