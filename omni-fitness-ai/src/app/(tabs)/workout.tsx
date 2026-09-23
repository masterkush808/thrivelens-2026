import React, { useCallback, useState, useMemo } from "react";
import { PremiumScreen } from "@/components/brand/PremiumScreen";
import { View, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Animated, { FadeInDown, Easing } from "react-native-reanimated";
import { ChevronRight, BookOpen, CalendarDays } from "lucide-react-native";
import { Text, Card, WorkoutCard, PressableScale } from "@/components/ui";
import { Schedule, upcomingSchedulesForUser } from "@/db";
import { currentUserId } from "@/lib/auth";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const categories = [
  "All",
  "Strength",
  "Hypertrophy",
  "Fat Loss",
  "Full Body",
  "Upper Body",
  "Lower Body",
  "Push",
  "Pull",
  "Legs",
  "Cardio",
];

const workouts = [
  {
    id: "1",
    title: "Chest & Triceps",
    duration: "45 min",
    difficulty: "Intermediate",
    muscleGroups: ["Chest", "Triceps"],
    exerciseCount: 8,
  },
  {
    id: "2",
    title: "Back & Biceps",
    duration: "50 min",
    difficulty: "Intermediate",
    muscleGroups: ["Back", "Biceps"],
    exerciseCount: 9,
  },
  {
    id: "3",
    title: "Leg Day",
    duration: "60 min",
    difficulty: "Advanced",
    muscleGroups: ["Quads", "Hamstrings", "Glutes"],
    exerciseCount: 10,
  },
  {
    id: "4",
    title: "Shoulders & Arms",
    duration: "40 min",
    difficulty: "Beginner",
    muscleGroups: ["Shoulders", "Biceps", "Triceps"],
    exerciseCount: 7,
  },
  {
    id: "5",
    title: "Full Body HIIT",
    duration: "30 min",
    difficulty: "Advanced",
    muscleGroups: ["Full Body"],
    exerciseCount: 12,
  },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDateString(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${date.getMonth() + 1}/${date.getDate()}`;
}

export default function WorkoutScreen() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [planned, setPlanned] = useState<Schedule[]>([]);

  const enteringHeader = useMemo(() => FadeInDown.duration(500).delay(0).easing(EASE_OUT), []);
  const enteringLibrary = useMemo(() => FadeInDown.duration(500).delay(100).easing(EASE_OUT), []);
  const enteringLevel = useMemo(() => FadeInDown.duration(500).delay(200).easing(EASE_OUT), []);
  const enteringCategories = useMemo(() => FadeInDown.duration(500).delay(300).easing(EASE_OUT), []);
  const enteringAI = useMemo(() => FadeInDown.duration(500).delay(400).easing(EASE_OUT), []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const user = await currentUserId();
        const rows = user ? await upcomingSchedulesForUser(user) : [];
        const today = localDateString();
        if (active) {
          setPlanned(
            rows
              .filter(
                (row) =>
                  row.kind === "workout" &&
                  row.status === "scheduled" &&
                  row.scheduledFor >= today,
              )
              .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
          );
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <PremiumScreen>
      <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={enteringHeader} className="px-6 py-4">
            <Text variant="h1">Workout</Text>
            <Text variant="body" className="text-text-secondary mt-1">
              Find the perfect workout for you
            </Text>
          </Animated.View>

          {/* Exercise Library Button */}
          <Animated.View entering={enteringLibrary} className="px-6 mb-6">
            <PressableScale
              onPress={() => router.push("/exercise-library")}
              className="bg-surface rounded-2xl p-4 border border-border flex-row items-center"
            >
              <View className="w-14 h-14 rounded-xl bg-primary/20 items-center justify-center mr-4">
                <BookOpen size={24} color="#E7BE73" />
              </View>
              <View className="flex-1">
                <Text variant="body" className="font-semibold text-text-primary">
                  Exercise Library
                </Text>
                <Text variant="bodySmall" className="text-text-secondary mt-1">
                  Curated exercise catalog with instructions for every move
                </Text>
              </View>
              <ChevronRight size={20} color="#ABA291" />
            </PressableScale>
          </Animated.View>

          {/* Fitness Level */}
          <Animated.View entering={enteringLevel} className="px-6 mb-6">
            <Text variant="h3" className="mb-3">
              Training Level
            </Text>
            <View className="flex-row gap-3">
              {["Beginner", "Intermediate", "Advanced"].map((level) => (
                <PressableScale
                  key={level}
                  className="flex-1 bg-surface py-3 rounded-xl items-center border border-border"
                  onPress={() =>
                    Alert.alert(
                      "Training Level",
                      "Thrive Lens tailors guidance using your profile and logged progress. Level filtering for the library is coming soon."
                    )
                  }
                >
                  <Text variant="bodySmall" className="text-text-secondary">
                    {level}
                  </Text>
                </PressableScale>
              ))}
            </View>
          </Animated.View>

          {/* Log a session CTA */}
          <Animated.View entering={enteringLevel} className="px-6 mb-6">
            <PressableScale onPress={() => router.push("/workout-logger")}>
              <Card variant="elevated">
                <View className="flex-row items-center gap-3">
                  <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center">
                    <Text variant="h3">🏋️</Text>
                  </View>
                  <View className="flex-1">
                    <Text variant="body" className="font-semibold">
                      Log a Workout
                    </Text>
                    <Text variant="bodySmall" className="text-text-secondary">
                      Build a session from the exercise catalog and save it to your
                      real progress history
                    </Text>
                  </View>
                  <Text variant="body" className="text-primary">
                    →
                  </Text>
                </View>
              </Card>
            </PressableScale>
          </Animated.View>

          {/* Planned Workouts */}
          {planned.length > 0 && (
            <Animated.View entering={enteringLevel} className="px-6 mb-6">
              <View className="flex-row items-center gap-2 mb-3">
                <CalendarDays size={18} color="#E7BE73" />
                <Text variant="h3">Planned Workouts</Text>
              </View>
              <Text variant="bodySmall" className="text-text-secondary mb-3">
                Scheduled by Thrive Lens — check back on each plan day to log your
                session
              </Text>
              <View className="gap-3">
                {planned.map((session) => (
                  <View
                    key={session.id}
                    className="bg-surface rounded-2xl p-4 border border-border"
                  >
                    <Text variant="bodySmall" className="text-primary">
                      {formatDay(session.scheduledFor)}
                    </Text>
                    <Text variant="body" className="font-semibold text-text-primary mt-0.5">
                      {session.title}
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* Categories */}
          <Animated.View entering={enteringCategories} className="mb-6">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24 }}
            >
              <View className="flex-row gap-2">
                {categories.map((category) => (
                  <PressableScale
                    key={category}
                    className={`px-4 py-2 rounded-full ${
                      selectedCategory === category
                        ? "bg-primary"
                        : "bg-surface-elevated"
                    }`}
                    onPress={() => setSelectedCategory(category)}
                  >
                    <Text
                      variant="bodySmall"
                      className={
                        selectedCategory === category
                          ? "text-text-inverse"
                          : "text-text-secondary"
                      }
                    >
                      {category}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </ScrollView>
          </Animated.View>

          {/* AI Generate Button */}
          <Animated.View entering={enteringAI} className="px-6 mb-6">
            <PressableScale onPress={() => router.push("/ai-coach")}>
              <Card variant="ai">
                <View className="flex-row items-center gap-3">
                  <View className="w-12 h-12 rounded-full bg-ai-glow/30 items-center justify-center">
                    <Text variant="h3" className="text-ai-glow">
                      🤖
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text variant="body" className="font-semibold">
                      Ask Thrive Lens
                    </Text>
                    <Text variant="bodySmall" className="text-text-secondary">
                      Meal plans, coaching and feedback on your progress
                    </Text>
                  </View>
                  <Text variant="body" className="text-ai-glow">
                    →
                  </Text>
                </View>
              </Card>
            </PressableScale>
          </Animated.View>

          {/* Workouts List */}
          <View className="px-6">
            <Text variant="h3" className="mb-1">
              Suggested Workouts
            </Text>
            <Text variant="bodySmall" className="text-text-secondary mb-4">
              Curated templates from the exercise library. Tap one to view its
              moves — then log your own session for real tracking
            </Text>
            <View className="gap-4">
              {workouts.map((workout, index) => (
                <Animated.View
                  key={workout.id}
                  entering={FadeInDown.duration(500).delay(500 + index * 100).easing(EASE_OUT)}
                >
                  <WorkoutCard
                    title={workout.title}
                    duration={workout.duration}
                    difficulty={workout.difficulty}
                    muscleGroups={workout.muscleGroups}
                    exerciseCount={workout.exerciseCount}
                    onPress={() => router.push("/exercise-library")}
                  />
                </Animated.View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}
