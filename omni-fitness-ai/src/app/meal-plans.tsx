import { PremiumScreen } from "@/components/brand/PremiumScreen";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text, Button, Card } from "@/components/ui";
import { activeMealPlan, MealPlan } from "@/db";
import { currentUserId } from "@/lib/auth";

interface DisplayDay {
  day: number;
  meals: {
    meal_type: string;
    food_name: string;
    amount_g: number;
  }[];
}

function parseDays(planJson: string): DisplayDay[] {
  try {
    const parsed = JSON.parse(planJson) as { days?: unknown };
    if (!Array.isArray(parsed.days)) return [];
    return parsed.days.flatMap((day) => {
      if (typeof day !== "object" || day === null) return [];
      const d = day as { day?: unknown; meals?: unknown };
      if (typeof d.day !== "number" || !Array.isArray(d.meals)) return [];
      const meals = d.meals.flatMap((meal) => {
        if (typeof meal !== "object" || meal === null) return [];
        const m = meal as { meal_type?: unknown; food_name?: unknown; amount_g?: unknown };
        if (
          (m.meal_type !== "breakfast" &&
            m.meal_type !== "lunch" &&
            m.meal_type !== "dinner" &&
            m.meal_type !== "snack") ||
          typeof m.food_name !== "string" ||
          typeof m.amount_g !== "number"
        ) {
          return [];
        }
        return [{ meal_type: m.meal_type, food_name: m.food_name, amount_g: m.amount_g }];
      });
      return [{ day: d.day, meals }];
    });
  } catch {
    return [];
  }
}

function parseShoppingList(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function MealPlansScreen() {
  const [plan, setPlan] = useState<MealPlan | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        try {
          const userId = await currentUserId();
          const active = userId ? await activeMealPlan(userId) : null;
          if (alive) setPlan(active);
        } catch (caught) {
          if (alive) setError(caught instanceof Error ? caught.message : "Couldn't load your meal plan.");
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const days = plan ? parseDays(plan.planJson) : [];
  const shoppingList = plan ? parseShoppingList(plan.groceryListJson) : [];

  return (
    <PremiumScreen>
      <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-border">
        <Pressable onPress={() => router.back()}>
          <Text variant="body" className="text-primary">
            ← Back
          </Text>
        </Pressable>
        <View className="items-center">
          <Text variant="h3">Meal Plans</Text>
          <Text variant="caption" className="text-text-secondary">
            Your approved week ahead
          </Text>
        </View>
        <View className="w-12" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
        {error && (
          <Card variant="default" className="mb-4">
            <Text variant="bodySmall" className="text-error">
              {error}
            </Text>
          </Card>
        )}

        {plan === undefined && (
          <Card variant="default" className="mb-4">
            <Text variant="bodySmall" className="text-text-secondary">
              Loading your plan…
            </Text>
          </Card>
        )}

        {plan === null && (
          <Card variant="default" className="mb-6">
            <Text variant="h3" className="mb-2">
              No meal plan yet
            </Text>
            <Text variant="bodySmall" className="text-text-secondary mb-4">
              Ask Thrive Lens to plan your meals — it builds a week from your
              goal, fridge and schedule, and only saves it with your approval.
            </Text>
            <Button title="Ask the coach" size="lg" onPress={() => router.push("/ai-coach")} />
          </Card>
        )}

        {plan && (
          <>
            <View className="mb-6">
              <Text variant="h2" className="mb-1">
                Week of {plan.weekStart}
              </Text>
              <Text variant="caption" className="text-text-secondary">
                {days.length > 0
                  ? `${days.length} days planned`
                  : "Empty plan — open the coach to rebuild it."}
              </Text>
            </View>

            {days.length > 0 && (
              <View className="gap-4 mb-6">
                {days.map((day) => (
                  <Card key={day.day} variant="default">
                    <Text variant="body" className="font-semibold mb-2">
                      {DAY_LABELS[day.day] ?? `Day ${day.day + 1}`}
                    </Text>
                    <View className="gap-2">
                      {day.meals.length === 0 && (
                        <Text variant="caption" className="text-text-tertiary">
                          Nothing planned this day.
                        </Text>
                      )}
                      {day.meals.map((meal, index) => (
                        <View
                          key={index}
                          className="flex-row justify-between items-center bg-surface-highlight rounded-lg px-3 py-2"
                        >
                          <Text variant="bodySmall" className="text-text-primary">
                            {meal.food_name}
                          </Text>
                          <View className="items-end">
                            <Text variant="caption" className="text-text-secondary">
                              {meal.amount_g} g
                            </Text>
                            <Text variant="caption" className="text-text-tertiary capitalize">
                              {meal.meal_type}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </Card>
                ))}
              </View>
            )}

            {shoppingList.length > 0 && (
              <Card variant="elevated" className="mb-6">
                <Text variant="h3" className="mb-3">
                  Shopping list
                </Text>
                <View className="gap-2">
                  {shoppingList.map((item, index) => (
                    <View key={index} className="flex-row items-center gap-2">
                      <View className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <Text variant="bodySmall" className="text-text-secondary">
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            <View className="gap-2">
              <Button
                title="Ask Thrive Lens to adjust it"
                variant="secondary"
                size="lg"
                onPress={() => router.push("/ai-coach")}
              />
            </View>
          </>
        )}
      </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}