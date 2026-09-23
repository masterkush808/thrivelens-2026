import { PremiumScreen } from "@/components/brand/PremiumScreen";
import React, { useMemo, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  TextInput as RNTextInput,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Dumbbell, Plus, Trash2 } from "lucide-react-native";
import { Text, Button, Card } from "@/components/ui";
import exercisesData from "@/data/exercises.json";
import { logWorkout } from "@/data/workoutRepository";

type ExerciseRow = {
  exerciseId: string;
  exerciseName: string;
  sets: string;
  reps: string;
  weight: string;
};

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

export default function WorkoutLoggerScreen() {
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null);
  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const [saving, setSaving] = useState(false);

  const available = useMemo(() => {
    return selectedBodyPart
      ? exercisesData.exercises.filter((e) => e.bodyPart === selectedBodyPart)
      : exercisesData.exercises;
  }, [selectedBodyPart]);

  const addExercise = (exerciseId: string, exerciseName: string) => {
    setRows((prev) => [...prev, { exerciseId, exerciseName, sets: "3", reps: "10", weight: "" }]);
  };

  const updateRow = (index: number, key: keyof ExerciseRow, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const validWeight = (value: string): boolean => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0;
  };

  const completeWorkout = async () => {
    if (rows.length === 0) {
      Alert.alert("No exercises", "Add at least one exercise to log a session.");
      return;
    }
    if (rows.some((row) => !validWeight(row.weight))) {
      Alert.alert(
        "Incomplete weight",
        "Enter a weight (kg) for every exercise. Use 0 for bodyweight moves.",
      );
      return;
    }
    setSaving(true);
    try {
      await logWorkout({
        workoutName: "Custom Session",
        exercises: rows.map((row) => ({
          exerciseId: row.exerciseId,
          exerciseName: row.exerciseName,
          sets: Math.max(1, Number.parseInt(row.sets, 10) || 1),
          repsPerSet: Math.max(1, Number.parseInt(row.reps, 10) || 1),
          weightKg: Number.parseFloat(row.weight) || 0,
        })),
      });
      router.back();
    } catch {
      setSaving(false);
      Alert.alert("Could not save", "Your workout could not be saved. Please retry.");
    }
  };

  return (
    <PremiumScreen>
      <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-surface items-center justify-center mr-3"
        >
          <ArrowLeft size={20} color="#FAF6EE" />
        </Pressable>
        <Text variant="h2" className="flex-1">
          Log a Workout
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Body part filter */}
        <View className="px-4 py-4">
          <Text variant="bodySmall" className="text-text-secondary mb-2">
            Filter exercises by body part
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setSelectedBodyPart(null)}
                className={`px-4 py-2 rounded-full border ${
                  selectedBodyPart === null ? "bg-primary border-primary" : "bg-surface border-border"
                }`}
              >
                <Text variant="bodySmall" className={selectedBodyPart === null ? "text-text-inverse" : "text-text-secondary"}>
                  All
                </Text>
              </Pressable>
              {exercisesData.bodyParts.map((bodyPart) => (
                <Pressable
                  key={bodyPart.id}
                  onPress={() => setSelectedBodyPart(bodyPart.id)}
                  className={`px-4 py-2 rounded-full border ${
                    selectedBodyPart === bodyPart.id
                      ? "bg-primary border-primary"
                      : "bg-surface border-border"
                  }`}
                >
                  <Text
                    variant="bodySmall"
                    className={selectedBodyPart === bodyPart.id ? "text-text-inverse" : "text-text-secondary"}
                  >
                    {bodyPart.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Exercise picker */}
        <View className="px-4 mb-6">
          <Text variant="h3" className="mb-3">
            Add exercises
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {available.map((exercise) => {
              const added = rows.some((row) => row.exerciseId === exercise.id);
              const color = bodyPartColors[exercise.bodyPart] || "#E7BE73";
              return (
                <Pressable
                  key={exercise.id}
                  disabled={added}
                  onPress={() => addExercise(exercise.id, exercise.name)}
                  className={`px-3 py-2 rounded-full border flex-row items-center gap-1 ${
                    added
                      ? "bg-success/20 border-success"
                      : "bg-surface border-border"
                  }`}
                >
                  {added ? (
                    <Text variant="caption" className="text-success">
                      ✓ {exercise.name}
                    </Text>
                  ) : (
                    <>
                      <Dumbbell size={12} color={color} />
                      <Text variant="caption" className="text-text-secondary">
                        {exercise.name}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Session editor */}
        {rows.length > 0 && (
          <View className="px-4 mb-6">
            <Text variant="h3" className="mb-3">
              Session
            </Text>
            <View className="gap-3">
              {rows.map((row, index) => {
                const color = bodyPartColors[
                  exercisesData.exercises.find((e) => e.id === row.exerciseId)?.bodyPart ?? "chest"
                ] || "#E7BE73";
                return (
                  <Card key={row.exerciseId} variant="default">
                    <View className="flex-row justify-between items-start mb-3">
                      <View className="flex-1 pr-2">
                        <Text variant="body" className="font-semibold text-text-primary">
                          {row.exerciseName}
                        </Text>
                      </View>
                      <Pressable onPress={() => removeRow(index)} className="p-1">
                        <Trash2 size={16} color="#FF6B6B" />
                      </Pressable>
                    </View>
                    <View className="flex-row gap-2" style={{ backgroundColor: `${color}10` }}>
                      <View className="flex-1">
                        <Text variant="caption" className="text-text-secondary mb-1">
                          Sets
                        </Text>
                        <RNTextInput
                          className="bg-surface-highlight rounded-lg px-3 py-2 text-text-primary"
                          value={row.sets}
                          onChangeText={(v) => updateRow(index, "sets", v.replace(/[^0-9]/g, ""))}
                          keyboardType="numeric"
                          placeholderTextColor="#ABA291"
                        />
                      </View>
                      <View className="flex-1">
                        <Text variant="caption" className="text-text-secondary mb-1">
                          Reps
                        </Text>
                        <RNTextInput
                          className="bg-surface-highlight rounded-lg px-3 py-2 text-text-primary"
                          value={row.reps}
                          onChangeText={(v) => updateRow(index, "reps", v.replace(/[^0-9]/g, ""))}
                          keyboardType="numeric"
                          placeholderTextColor="#ABA291"
                        />
                      </View>
                      <View className="flex-1">
                        <Text variant="caption" className="text-text-secondary mb-1">
                          Weight (kg)
                        </Text>
                        <RNTextInput
                          className="bg-surface-highlight rounded-lg px-3 py-2 text-text-primary"
                          value={row.weight}
                          onChangeText={(v) => updateRow(index, "weight", v.replace(/[^0-9.]/g, ""))}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor="#ABA291"
                        />
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>

            <View className="mt-6">
              <Button
                title={saving ? "Saving..." : "Complete & Save Workout"}
                size="lg"
                onPress={() => void completeWorkout()}
                disabled={saving}
              />
            </View>
          </View>
        )}

        {rows.length === 0 && (
          <View className="px-4">
            <Card variant="elevated">
              <View className="items-center py-8">
                <Plus size={20} color="#ABA291" />
                <Text variant="body" className="text-text-secondary mt-3">
                  Tap exercises above to build your session.
                </Text>
                <Text variant="bodySmall" className="text-text-tertiary mt-1 text-center">
                  Every completed session is stored on-device and shows up on
                  your home summary and strength progression.
                </Text>
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}