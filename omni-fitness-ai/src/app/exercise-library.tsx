import { PremiumScreen } from "@/components/brand/PremiumScreen";
import React, { useState, useMemo } from "react";
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ArrowLeft,
  Search,
  Dumbbell,
  ChevronRight,
  X,
} from "lucide-react-native";
import { Text } from "@/components/ui";
import exercisesData from "@/data/exercises.json";

const bodyPartColors: Record<string, string> = {
  chest: "#FF6B6B",
  shoulders: "#4ECDC4",
  biceps: "#45B7D1",
  triceps: "#96CEB4",
  back: "#FFEAA7",
  quads: "#DDA0DD",
  hamstrings: "#FF8A5C",
  abs: "#88D8B0",
  glutes: "#C9B1FF",
};

export default function ExerciseLibraryScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null);

  const filteredExercises = useMemo(() => {
    let exercises = exercisesData.exercises;

    if (selectedBodyPart) {
      exercises = exercises.filter((e) => e.bodyPart === selectedBodyPart);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      exercises = exercises.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.equipment.toLowerCase().includes(query) ||
          e.type.toLowerCase().includes(query)
      );
    }

    return exercises;
  }, [selectedBodyPart, searchQuery]);

  const handleExercisePress = (exercise: (typeof exercisesData.exercises)[0]) => {
    router.push({
      pathname: "/exercise-detail",
      params: {
        id: exercise.id,
        name: exercise.name,
        bodyPart: exercise.bodyPart,
        type: exercise.type,
        equipment: exercise.equipment,
        mechanics: exercise.mechanics,
        level: exercise.level,
        videoPath: exercise.videoPath,
        description: exercise.description,
      },
    });
  };

  return (
    <PremiumScreen>
      <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-surface items-center justify-center mr-3"
        >
          <ArrowLeft size={20} color="#FAF6EE" />
        </Pressable>
        <Text variant="h2" className="flex-1">
          Exercise Library
        </Text>
      </View>

      {/* Search Bar */}
      <View className="px-4 py-3">
        <View className="flex-row items-center bg-surface rounded-xl px-4 py-3 border border-border">
          <Search size={20} color="#ABA291" />
          <TextInput
            placeholder="Search exercises..."
            placeholderTextColor="#ABA291"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 ml-3 text-text-primary text-base"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <X size={18} color="#ABA291" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Body Parts Grid */}
        <View className="px-4 mb-6">
          <Text variant="h3" className="mb-3">
            Body Parts
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {exercisesData.bodyParts.map((bodyPart) => {
              const count = exercisesData.exercises.filter(
                (e) => e.bodyPart === bodyPart.id
              ).length;
              const isSelected = selectedBodyPart === bodyPart.id;
              const color = bodyPartColors[bodyPart.id] || "#E7BE73";

              return (
                <Pressable
                  key={bodyPart.id}
                  onPress={() =>
                    setSelectedBodyPart(isSelected ? null : bodyPart.id)
                  }
                  className={`w-[47%] rounded-2xl p-4 border ${
                    isSelected ? "border-primary" : "border-border"
                  }`}
                  style={{
                    backgroundColor: isSelected ? `${color}20` : "#181611",
                  }}
                >
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text variant="body" className="font-semibold text-text-primary">
                        {bodyPart.name}
                      </Text>
                      <Text variant="caption" className="text-text-secondary mt-1">
                        {count} exercises
                      </Text>
                    </View>
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center"
                      style={{ backgroundColor: `${color}30` }}
                    >
                      <Dumbbell size={18} color={color} />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Exercise List */}
        <View className="px-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text variant="h3">
              {selectedBodyPart
                ? exercisesData.bodyParts.find((b) => b.id === selectedBodyPart)
                    ?.name || "Exercises"
                : "All Exercises"}
            </Text>
            <Text variant="bodySmall" className="text-text-secondary">
              {filteredExercises.length} exercises
            </Text>
          </View>

          <View className="gap-3">
            {filteredExercises.map((exercise) => (
              <Pressable
                key={exercise.id}
                onPress={() => handleExercisePress(exercise)}
                className="bg-surface rounded-xl p-4 border border-border flex-row items-center"
              >
                {/* Thumbnail */}
                <View
                  className="w-16 h-16 rounded-lg items-center justify-center mr-4"
                  style={{
                    backgroundColor: `${bodyPartColors[exercise.bodyPart] || "#E7BE73"}20`,
                  }}
                >
                  <Dumbbell
                    size={24}
                    color={bodyPartColors[exercise.bodyPart] || "#E7BE73"}
                  />
                </View>

                {/* Info */}
                <View className="flex-1">
                  <Text variant="body" className="font-semibold text-text-primary">
                    {exercise.name}
                  </Text>
                  <View className="flex-row items-center mt-1 gap-2">
                    <View className="bg-surface-elevated px-2 py-0.5 rounded">
                      <Text variant="caption" className="text-text-secondary">
                        {exercise.equipment}
                      </Text>
                    </View>
                    <View className="bg-surface-elevated px-2 py-0.5 rounded">
                      <Text variant="caption" className="text-text-secondary">
                        {exercise.mechanics}
                      </Text>
                    </View>
                    <View className="bg-surface-elevated px-2 py-0.5 rounded">
                      <Text variant="caption" className="text-text-secondary">
                        {exercise.level}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Arrow */}
                <ChevronRight size={20} color="#ABA291" />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}
