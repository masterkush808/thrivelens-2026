import { PremiumScreen } from "@/components/brand/PremiumScreen";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";

import { Text, Button, Card } from "@/components/ui";
import {
  deleteFridgeItem,
  fridgeItemsForUser,
  insertFridgeItems,
  markFridgeItemUsed,
  FridgeItem,
} from "@/db";
import { currentUserId } from "@/lib/auth";

export default function FridgeScreen() {
  const [items, setItems] = useState<FridgeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("");

  const load = async () => {
    try {
      const userId = await currentUserId();
      const rows = userId ? await fridgeItemsForUser(userId) : [];
      setItems(rows);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load your fridge.");
    }
  };

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  const handleUseUp = async (id: string, userId: string) => {
    await markFridgeItemUsed(id, userId);
    void load();
  };

  const handleRemove = async (id: string, userId: string) => {
    await deleteFridgeItem(id, userId);
    void load();
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setNote(null);
    try {
      const userId = await currentUserId();
      if (!userId) {
        setNote("Sign in to add items to your fridge.");
        return;
      }
      const quantity = Number.parseFloat(newQuantity);
      await insertFridgeItems([
        {
          id: Crypto.randomUUID(),
          userId,
          name,
          category: null,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
          unit: Number.isFinite(quantity) && quantity > 0 ? "g" : null,
          addedDate: new Date().toISOString().slice(0, 10),
          expiryDate: null,
          used: false,
          createdAt: new Date().toISOString(),
        },
      ]);
      setNewName("");
      setNewQuantity("");
      setNote("Added to your fridge.");
      void load();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Couldn't add that item.");
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
        <View className="items-center">
          <Text variant="h3">My Kitchen</Text>
          <Text variant="caption" className="text-text-secondary">
            What you have on hand
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

        <Card variant="default" className="mb-6">
          <Text variant="h3" className="mb-3">
            Add an item
          </Text>
          <View className="flex-row items-center gap-3 mb-3">
            <TextInput
              className="flex-1 bg-surface-highlight rounded-xl px-4 py-3 text-text-primary"
              placeholder="e.g. Chicken breast"
              placeholderTextColor="#ABA291"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              className="w-24 bg-surface-highlight rounded-xl px-4 py-3 text-text-primary"
              placeholder="g"
              placeholderTextColor="#ABA291"
              value={newQuantity}
              onChangeText={(text) => setNewQuantity(text.replace(/[^0-9.]/g, ""))}
              keyboardType="numeric"
            />
          </View>
          <Button title="Add to Fridge" size="lg" onPress={() => void handleAdd()} />
          {note && (
            <Text variant="caption" className="text-text-secondary mt-2">
              {note}
            </Text>
          )}
        </Card>

        {items === null && (
          <Card variant="default" className="mb-4">
            <Text variant="bodySmall" className="text-text-secondary">
              Loading your fridge…
            </Text>
          </Card>
        )}

        {items !== null && items.length === 0 && (
          <Card variant="default" className="mb-6">
            <Text variant="h3" className="mb-2">
              Fridge is empty
            </Text>
            <Text variant="bodySmall" className="text-text-secondary mb-4">
              Add items from a scan, a barcode, or the coach. Thrive Lens uses
              your fridge stocks to plan meals and groceries without double
              buying.
            </Text>
            <View className="gap-2">
              <Button title="Scan food" variant="secondary" size="lg" onPress={() => router.push("/food-scanner")} />
              <Button title="Ask the coach" variant="secondary" size="lg" onPress={() => router.push("/ai-coach")} />
            </View>
          </Card>
        )}

        {items !== null && items.length > 0 && (
          <View className="gap-3">
            {items.map((item) => (
              <Card key={item.id} variant="default">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text variant="body" className="font-semibold">
                      {item.name}
                    </Text>
                    <Text variant="caption" className="text-text-secondary mt-0.5">
                      {item.quantity != null
                        ? `${item.quantity} ${item.unit ?? "g"}`
                        : "Quantity unknown"} · added {item.addedDate}
                    </Text>
                    {item.expiryDate && (
                      <Text variant="caption" className="text-warning mt-0.5">
                        Expires {item.expiryDate}
                      </Text>
                    )}
                  </View>
                  <View className="gap-2 ml-3">
                    <Button
                      title="Use up"
                      variant="secondary"
                      size="sm"
                      onPress={() => void handleUseUp(item.id, item.userId)}
                    />
                    <Button
                      title="Remove"
                      variant="ghost"
                      size="sm"
                      onPress={() => void handleRemove(item.id, item.userId)}
                    />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}