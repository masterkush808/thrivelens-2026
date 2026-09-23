import { PremiumScreen } from "@/components/brand/PremiumScreen";
import React, { useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";

import { Text, Button, Card } from "@/components/ui";
import {
  AnalysisOutcome,
  confirmAndLog,
  detectFood,
  ESTIMATE_DISCLAIMER,
  MEAL_TYPES,
  MealType,
} from "@/lib/food-recognition";
import { buildCoachContext } from "@/lib/coach-context";
import { currentUser, currentUserId } from "@/lib/auth";
import { coachChat, FoodCandidate, InferenceError } from "@/services/inference";
import { FoodLog, insertFridgeItems } from "@/db";

type Phase = "select" | "scanning" | "results" | "saving" | "saved" | "error";

const errorMessage = (error: unknown): string => {
  const inferred = error as InferenceError;
  if (inferred?.message) {
    return inferred.message;
  }
  switch (inferred?.code) {
    case "not_configured":
      return "Analysis isn't available on this build. Please try again later.";
    case "timeout":
      return "The analysis timed out. Please try again.";
    case "network":
      return "Couldn't reach the service. Check your connection and try again.";
    case "http":
      return "Analysis failed. Please try again.";
    default:
      return "Analysis failed. Please try again.";
  }
};

export default function FoodScannerScreen() {
  const [phase, setPhase] = useState<Phase>("select");
  const [photo, setPhoto] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AnalysisOutcome | null>(null);
  const [savedLog, setSavedLog] = useState<FoodLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FoodCandidate | null>(null);
  const [amount, setAmount] = useState("100");
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingPending, setBriefingPending] = useState(false);
  const [fridgeNote, setFridgeNote] = useState<string | null>(null);

  const reset = () => {
    setPhase("select");
    setPhoto(null);
    setOutcome(null);
    setSavedLog(null);
    setError(null);
    setSelected(null);
    setAmount("100");
    setMealType("lunch");
    setBriefing(null);
    setBriefingPending(false);
    setFridgeNote(null);
  };

  const localDateString = (): string => {
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  };

  const produceBriefing = async (topCandidate: string) => {
    setBriefingPending(true);
    try {
      const user = await currentUser();
      const context = await buildCoachContext(user?.id ?? "");
      const result = await coachChat({
        context,
        messages: [
          {
            role: "user",
            content:
              `I just scanned a photo of my meal and the top candidate is ${topCandidate}. ` +
              "Give me an honest, brief 1-2 sentence take on it.",
          },
        ],
      });
      setBriefing(result.refusal ?? result.reply);
    } catch {
      setBriefing(null);
    } finally {
      setBriefingPending(false);
    }
  };

  const runAnalyze = async (uri: string) => {
    setPhoto(uri);
    setPhase("scanning");
    setError(null);
    try {
      const result = await detectFood(uri);
      setOutcome(result);
      setPhase("results");
      setFridgeNote(null);
      if (result.candidateStatus !== "abstained" && result.candidates.length > 0) {
        setSelected(result.candidates[0]);
        void produceBriefing(result.candidates[0].name);
      }
    } catch (caught) {
      setError(errorMessage(caught));
      setPhase("error");
    }
  };

  const pickFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission was denied. Use Upload Photo instead.");
      setPhase("error");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      void runAnalyze(result.assets[0].uri);
    }
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission was denied.");
      setPhase("error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      void runAnalyze(result.assets[0].uri);
    }
  };

  const addToFridge = async () => {
    if (!selected) return;
    setFridgeNote(null);
    try {
      const userId = await currentUserId();
      if (!userId) {
        setFridgeNote("Sign in to add items to your fridge.");
        return;
      }
      await insertFridgeItems([
        {
          id: Crypto.randomUUID(),
          userId,
          name: selected.name,
          category: null,
          quantity: null,
          unit: null,
          addedDate: localDateString(),
          expiryDate: null,
          used: false,
          createdAt: new Date().toISOString(),
        },
      ]);
      setFridgeNote("Added to your fridge.");
    } catch (caught) {
      setFridgeNote(errorMessage(caught));
    }
  };

  const addToMeal = async () => {
    if (!outcome || !selected) return;
    const grams = Number.parseFloat(amount);
    if (!Number.isFinite(grams) || grams <= 0 || grams > 2000) {
      setError("Enter a portion between 1 and 2000 g.");
      return;
    }
    setPhase("saving");
    setError(null);
    try {
      const confirmed = await confirmAndLog({
        foodName: selected.name,
        amountGrams: grams,
        mealType,
        candidateConfidence: selected.confidence,
        aiModelVersion: outcome.modelRevision,
        requestId: outcome.requestId,
        imageUri: photo,
      });
      setSavedLog(confirmed.log);
      setPhase("saved");
    } catch (caught) {
      setError(errorMessage(caught));
      setPhase("results");
    }
  };

  return (
    <PremiumScreen>
      <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-border">
        <Pressable onPress={() => router.back()}>
          <Text variant="body" className="text-primary">
            ← Back
          </Text>
        </Pressable>
        <Text variant="h3">Scan Your Food</Text>
        <View className="w-12" />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {phase === "select" && (
          <>
            <View className="bg-surface rounded-2xl h-64 items-center justify-center mb-6 border border-border">
              <View className="items-center">
                <Text variant="h1" className="mb-4">
                  📷
                </Text>
                <Text variant="body" className="text-text-secondary">
                  Point camera at your food
                </Text>
                <Text variant="caption" className="text-text-tertiary mt-2">
                  Or choose an option below
                </Text>
              </View>
            </View>
            <View className="gap-3">
              <Pressable
                className="flex-row items-center gap-4 bg-surface p-4 rounded-xl border border-border"
                onPress={() => void pickFromCamera()}
              >
                <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center">
                  <Text variant="h3">📷</Text>
                </View>
                <View className="flex-1">
                  <Text variant="body" className="font-semibold">
                    Take Photo
                  </Text>
                  <Text variant="bodySmall" className="text-text-secondary">
                    Use your camera to scan food
                  </Text>
                </View>
                <Text variant="body" className="text-text-tertiary">
                  →
                </Text>
              </Pressable>
              <Pressable
                className="flex-row items-center gap-4 bg-surface p-4 rounded-xl border border-border"
                onPress={() => void pickFromLibrary()}
              >
                <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center">
                  <Text variant="h3">🖼️</Text>
                </View>
                <View className="flex-1">
                  <Text variant="body" className="font-semibold">
                    Upload Photo
                  </Text>
                  <Text variant="bodySmall" className="text-text-secondary">
                    Choose from your gallery
                  </Text>
                </View>
                <Text variant="body" className="text-text-tertiary">
                  →
                </Text>
              </Pressable>
              <Pressable
                className="flex-row items-center gap-4 bg-surface p-4 rounded-xl border border-border"
                onPress={() => router.push("/scan-barcode")}
              >
                <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center">
                  <Text variant="h3">📊</Text>
                </View>
                <View className="flex-1">
                  <Text variant="body" className="font-semibold">
                    Scan Barcode
                  </Text>
                  <Text variant="bodySmall" className="text-text-secondary">
                    Look up packaged foods and log their nutrition
                  </Text>
                </View>
                <Text variant="body" className="text-text-tertiary">
                  →
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {phase === "scanning" && (
          <View className="bg-surface rounded-2xl h-64 items-center justify-center mb-6 border border-border">
            <View className="items-center">
              <Text variant="h1" className="mb-4">
                🔍
              </Text>
              <Text variant="body" className="text-text-secondary">
                Analyzing your meal...
              </Text>
              <Text variant="caption" className="text-text-tertiary mt-2">
                Powered by Thrive Lens AI
              </Text>
            </View>
          </View>
        )}

        {phase === "error" && (
          <Card variant="default" className="mb-4">
            <Text variant="h3" className="text-error mb-2">
              Could not analyze
            </Text>
            <Text variant="body" className="text-text-secondary mb-4">
              {error}
            </Text>
            <Button title="Try Again" size="lg" onPress={reset} />
          </Card>
        )}

        {phase === "results" && outcome && (
          <>
            {photo && (
              <Image
                source={{ uri: photo }}
                className="w-full h-48 rounded-2xl mb-6 border border-border"
                resizeMode="cover"
              />
            )}

            {outcome.candidateStatus === "abstained" ? (
              <Card variant="default" className="mb-6">
                <Text variant="h3" className="mb-2">
                  No confident match
                </Text>
                <Text variant="body" className="text-text-secondary mb-4">
                  No confident match found. Please try a clearer, closer photo
                  with even lighting.
                </Text>
                <Button title="Scan Again" variant="secondary" size="lg" onPress={reset} />
              </Card>
            ) : (
              <>
                <View className="mb-6">
                  <Text variant="h2" className="mb-2">
                    Scan Results
                  </Text>
                  <Text variant="body" className="text-text-secondary">
                    Candidate foods · tap one to confirm
                  </Text>
                </View>

                <View className="gap-3 mb-6">
                  {outcome.candidates.map((candidate, index) => (
                    <Card
                      key={`${candidate.task}-${index}`}
                      variant={selected?.name === candidate.name ? "elevated" : "default"}
                    >
                      <Pressable onPress={() => setSelected(candidate)}>
                        <View className="flex-row justify-between items-start">
                          <View className="flex-1">
                            <Text variant="body" className="font-semibold">
                              {candidate.name || candidate.task}
                            </Text>
                            <Text variant="caption" className="text-text-tertiary mt-1">
                              {candidate.task}
                            </Text>
                          </View>
                          {candidate.confidence != null && (
                            <Text variant="statSmall" className="text-primary">
                              {Math.round(candidate.confidence * 100)}%
                            </Text>
                          )}
                        </View>
                        <View className="mt-2 h-1 bg-surface-highlight rounded-full overflow-hidden">
                          <View
                            className="h-full bg-success rounded-full"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(100, (candidate.confidence ?? 0) * 100),
                              )}%`,
                            }}
                          />
                        </View>
                      </Pressable>
                    </Card>
                  ))}
                </View>

                {briefingPending && (
                  <Card variant="default" className="mb-6">
                    <Text variant="caption" className="text-text-secondary">
                      Thrive Lens is briefing you on this...
                    </Text>
                  </Card>
                )}
                {!briefingPending && briefing && (
                  <Card variant="default" className="mb-6">
                    <Text variant="h3" className="mb-2">
                      {"Coach's take"}
                    </Text>
                    <Text variant="bodySmall" className="text-text-primary">
                      {briefing}
                    </Text>
                  </Card>
                )}

                {selected && (
                  <Card variant="elevated" className="mb-6">
                    <Text variant="h3" className="mb-3">
                      Edit & Confirm
                    </Text>
                    <Text variant="bodySmall" className="text-text-secondary mb-2">
                      {selected.name}
                    </Text>
                    <View className="flex-row items-center gap-3 mb-4">
                      <TextInput
                        className="flex-1 bg-surface-highlight rounded-xl px-4 py-3 text-text-primary"
                        value={amount}
                        onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ""))}
                        keyboardType="numeric"
                        placeholder="grams"
                        placeholderTextColor="#ABA291"
                      />
                      <Text variant="body" className="text-text-secondary">
                        g
                      </Text>
                    </View>
                    <View className="flex-row flex-wrap gap-2 mb-4">
                      {MEAL_TYPES.map((meal) => (
                        <Pressable
                          key={meal}
                          className={`px-4 py-2 rounded-full border ${
                            mealType === meal
                              ? "bg-primary border-primary"
                              : "bg-surface-highlight border-border"
                          }`}
                          onPress={() => setMealType(meal)}
                        >
                          <Text
                            variant="caption"
                            className={mealType === meal ? "text-text-inverse" : "text-text-secondary"}
                          >
                            {meal}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Button title="Add to Meal" size="lg" onPress={() => void addToMeal()} />
                      </View>
                      <View className="flex-1">
                        <Button
                          title="Add to Fridge"
                          variant="secondary"
                          size="lg"
                          onPress={() => void addToFridge()}
                        />
                      </View>
                    </View>
                    {fridgeNote && (
                      <Text variant="caption" className="text-text-secondary mt-2">
                        {fridgeNote}
                      </Text>
                    )}
                  </Card>
                )}

                <View className="gap-2">
                  <Button title="Scan Again" variant="ghost" size="lg" onPress={reset} />
                </View>
              </>
            )}

            <Text variant="caption" className="text-text-tertiary text-center mt-4">
              {ESTIMATE_DISCLAIMER}
            </Text>
          </>
        )}

        {phase === "saving" && (
          <View className="items-center py-16">
            <Text variant="body" className="text-text-secondary">
              Confirming your meal and nutrition...
            </Text>
          </View>
        )}

        {phase === "saved" && savedLog && (
          <Card variant="elevated" className="mb-6">
            <Text variant="h2" className="text-success mb-2">
              ✓ Logged
            </Text>
            <Text variant="body" className="text-text-secondary mb-1">
              {savedLog.foodName} · {savedLog.amountGrams}g ·{" "}
              {savedLog.mealType}
            </Text>
            <Text variant="statSmall" className="text-primary mb-3">
              {savedLog.calories} kcal
            </Text>
            <View className="flex-row justify-between mb-4">
              <View className="items-center">
                <Text variant="caption" className="text-text-tertiary">
                  Protein
                </Text>
                <Text variant="bodySmall" className="text-text-secondary">
                  {savedLog.protein}g
                </Text>
              </View>
              <View className="items-center">
                <Text variant="caption" className="text-text-tertiary">
                  Carbs
                </Text>
                <Text variant="bodySmall" className="text-text-secondary">
                  {savedLog.carbs}g
                </Text>
              </View>
              <View className="items-center">
                <Text variant="caption" className="text-text-tertiary">
                  Fat
                </Text>
                <Text variant="bodySmall" className="text-text-secondary">
                  {savedLog.fat}g
                </Text>
              </View>
            </View>
            <Text variant="caption" className="text-text-tertiary mb-4">
              Nutrition estimates · verified after confirmation
            </Text>
            <View className="gap-2">
              <Button title="Done" size="lg" onPress={() => router.back()} />
              <Button title="Scan Another" variant="ghost" size="lg" onPress={reset} />
            </View>
          </Card>
        )}
      </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}