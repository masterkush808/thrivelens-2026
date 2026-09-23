import { PremiumScreen } from "@/components/brand/PremiumScreen";
import * as Crypto from "expo-crypto";
import React, { useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View, Alert } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";

import { Text, Button, Card } from "@/components/ui";
import {
  confirmBarcodeAndLog,
  ESTIMATE_DISCLAIMER,
  MEAL_TYPES,
  MealType,
} from "@/lib/food-recognition";
import { currentUserId } from "@/lib/auth";
import {
  OffError,
  OffProduct,
  lookupProductByBarcode,
  validBarcode,
} from "@/services/openFoodFacts";
import { insertFridgeItems, FoodLog } from "@/db";

type Phase = "ready" | "scanning" | "results" | "saving" | "saved" | "error";

const errorMessage = (error: unknown): string => {
  if (error instanceof OffError) {
    switch (error.code) {
      case "not_found":
        return error.message;
      case "timeout":
        return "The product lookup timed out. Check your connection and try again.";
      case "network":
        return "The product database is unreachable right now. Please retry.";
      case "http":
        return error.message;
      default:
        return error.message;
    }
  }
  return "Scanning failed. Please try again.";
};

export default function ScanBarcodeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>("ready");
  const [scanned, setScanned] = useState(false);
  const [partialCode, setPartialCode] = useState("");
  const [product, setProduct] = useState<OffProduct | null>(null);
  const [amount, setAmount] = useState("100");
  const [mealType, setMealType] = useState<MealType>("snack");
  const [savedLog, setSavedLog] = useState<FoodLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fridgeNote, setFridgeNote] = useState<string | null>(null);
  const timestampRef = useRef(0);

  const reset = () => {
    setScanned(false);
    setProduct(null);
    setPhase("ready");
    setAmount("100");
    setMealType("snack");
    setError(null);
    setSavedLog(null);
    setFridgeNote(null);
  };

  const runLookup = async (barcode: string) => {
    setPhase("scanning");
    setError(null);
    try {
      const result = await lookupProductByBarcode(barcode);
      setProduct(result.product);
      setPhase("results");
    } catch (caught) {
      setError(errorMessage(caught));
      setPhase("error");
    }
  };

  const onBarcodeScanned = ({
    type,
    data,
  }: {
    type: string;
    data: string;
  }) => {
    const now = Date.now();
    if (now - timestampRef.current < 2000) return;
    timestampRef.current = now;
    const digits = data.replace(/\s+/g, "");
    if (!validBarcode(digits)) {
      setPartialCode(digits);
      return;
    }
    setScanned(true);
    void runLookup(digits);
  };

  const addToMeal = async () => {
    if (!product) return;
    const grams = Number.parseFloat(amount);
    if (!Number.isFinite(grams) || grams <= 0 || grams > 2000) {
      setError("Enter a portion between 1 and 2000 g.");
      return;
    }
    setPhase("saving");
    setError(null);
    try {
      const log = await confirmBarcodeAndLog({
        foodName: product.productName,
        barcode: product.barcode,
        per100g: {
          energyKcal: product.nutriments.energyKcal100g ?? 0,
          protein: product.nutriments.protein100g ?? 0,
          carbs: product.nutriments.carbs100g ?? 0,
          fat: product.nutriments.fat100g ?? 0,
          fiber: product.nutriments.fiber100g,
        },
        missingFields: [],
        amountGrams: grams,
        mealType,
      });
      setSavedLog(log);
      setPhase("saved");
    } catch (caught) {
      setError(errorMessage(caught));
      setPhase("results");
    }
  };

  const addToFridge = async () => {
    if (!product) return;
    setFridgeNote(null);
    const grams = Number.parseFloat(amount);
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
          name: product.productName,
          category: null,
          quantity: Number.isFinite(grams) && grams > 0 ? grams : null,
          unit: "g",
          addedDate: new Date().toISOString().slice(0, 10),
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

  const requestAndStart = async () => {
    const result = await requestPermission();
    if (!result.granted) {
      Alert.alert(
        "Camera permission required",
        "Barcode scanning needs camera access. Enable it in Settings to continue.",
      );
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
        <Text variant="h3">Scan a Barcode</Text>
        <View className="w-12" />
      </View>

      {(phase === "ready" || phase === "scanning") && (
        <View className="flex-1">
          <View className="flex-1 bg-black">
            {permission?.granted ? (
              <CameraView
                className="flex-1"
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: [
                    "ean13",
                    "ean8",
                    "upc_a",
                    "upc_e",
                    "code128",
                    "codabar",
                    "itf14",
                  ],
                }}
                onBarcodeScanned={
                  phase === "ready" && !scanned
                    ? onBarcodeScanned
                    : undefined
                }
              />
            ) : (
              <View className="flex-1 items-center justify-center px-8">
                <Text variant="h2" className="text-text-primary text-center mb-3">
                  1234 5678 9012
                </Text>
                <Text variant="body" className="text-text-secondary text-center leading-6">
                  To scan a product barcode, allow camera access.
                </Text>
              </View>
            )}
          </View>

          <View className="bg-background p-6">
            {permission?.granted ? (
              phase === "scanning" ? (
                <Text variant="body" className="text-text-secondary text-center py-2">
                  Looking up product…
                </Text>
              ) : scanned ? (
                <Text variant="body" className="text-text-secondary text-center py-2">
                  Please wait…
                </Text>
              ) : (
                <View className="items-center gap-2 py-2">
                  <Text variant="h3">Align the barcode with the frame</Text>
                  <Text variant="bodySmall" className="text-text-secondary text-center leading-5">
                    Packaged foods are matched to verified nutrition
                    information so you can log them accurately.
                  </Text>
{partialCode.length > 0 && (
                      <Text variant="caption" className="text-warning">
                        {partialCode} is not a valid barcode.
                      </Text>
                    )}
                </View>
              )
            ) : (
              <Button title="Allow Camera Access" size="lg" onPress={() => void requestAndStart()} />
            )}
          </View>
        </View>
      )}

      {phase === "error" && (
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <Card variant="default" className="mb-4">
            <Text variant="h3" className="text-error mb-2">
              Could not look up product
            </Text>
            <Text variant="body" className="text-text-secondary mb-4">
              {error}
            </Text>
            <View className="gap-2">
              <Button title="Try Again" size="lg" onPress={reset} />
              <Button title="Back" variant="ghost" size="lg" onPress={() => router.back()} />
            </View>
          </Card>
        </ScrollView>
      )}

      {phase === "saving" && (
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View className="items-center py-16">
            <Text variant="body" className="text-text-secondary">
              Saving your log…
            </Text>
          </View>
        </ScrollView>
      )}

      {phase === "results" && product && (
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <Card variant="elevated" className="mb-6">
            <Text variant="caption" className="text-text-tertiary mb-1">
              {product.brand ?? "Product"} · {product.barcode}
            </Text>
            <Text variant="h2" className="mb-2">
              {product.productName}
            </Text>
            {product.quantity && (
              <Text variant="bodySmall" className="text-text-secondary mb-3">
                Package: {product.quantity}
              </Text>
            )}
            <View className="flex-row justify-between py-3 border-t border-border">
              <View className="items-center">
                <Text variant="statSmall" className="text-accent">
                  {product.nutriments.energyKcal100g}
                </Text>
                <Text variant="caption" className="text-text-tertiary">
                  kcal/100g
                </Text>
              </View>
              <View className="items-center">
                <Text variant="statSmall" className="text-primary">
                  {product.nutriments.protein100g}g
                </Text>
                <Text variant="caption" className="text-text-tertiary">
                  Protein
                </Text>
              </View>
              <View className="items-center">
                <Text variant="statSmall" className="text-success">
                  {product.nutriments.carbs100g}g
                </Text>
                <Text variant="caption" className="text-text-tertiary">
                  Carbs
                </Text>
              </View>
              <View className="items-center">
                <Text variant="statSmall" className="text-warning">
                  {product.nutriments.fat100g}g
                </Text>
                <Text variant="caption" className="text-text-tertiary">
                  Fat
                </Text>
              </View>
            </View>
          </Card>

          <Card variant="elevated" className="mb-6">
            <Text variant="h3" className="mb-3">
              Confirm
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

          <Text variant="caption" className="text-text-tertiary text-center">
            {ESTIMATE_DISCLAIMER}
          </Text>
          <Text variant="caption" className="text-text-tertiary text-center mt-2">
            Verified nutrition information
          </Text>
          <View className="mt-4">
            <Button title="Scan Another" variant="secondary" size="lg" onPress={reset} />
          </View>
        </ScrollView>
      )}

      {phase === "saved" && savedLog && (
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <Card variant="elevated" className="mb-6">
            <Text variant="h2" className="text-success mb-2">
              ✓ Logged
            </Text>
            <Text variant="body" className="text-text-secondary mb-1">
              {savedLog.foodName} · {savedLog.amountGrams}g · {savedLog.mealType}
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
                  {savedLog.protein.toFixed(1)}g
                </Text>
              </View>
              <View className="items-center">
                <Text variant="caption" className="text-text-tertiary">
                  Carbs
                </Text>
                <Text variant="bodySmall" className="text-text-secondary">
                  {savedLog.carbs.toFixed(1)}g
                </Text>
              </View>
              <View className="items-center">
                <Text variant="caption" className="text-text-tertiary">
                  Fat
                </Text>
                <Text variant="bodySmall" className="text-text-secondary">
                  {savedLog.fat.toFixed(1)}g
                </Text>
              </View>
            </View>
            <Text variant="caption" className="text-text-tertiary mb-4">
              Verified nutrition information
            </Text>
            <View className="gap-2">
              <Button title="Done" size="lg" onPress={() => router.back()} />
              <Button title="Scan Another" variant="ghost" size="lg" onPress={reset} />
            </View>
          </Card>
        </ScrollView>
      )}
      </SafeAreaView>
    </PremiumScreen>
  );
}