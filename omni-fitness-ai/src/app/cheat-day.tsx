import { PremiumScreen } from "@/components/brand/PremiumScreen";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";

import { Text, Button, Card } from "@/components/ui";
import { insertCheatDay, latestCheatDay } from "@/db";
import { buildAdherenceSnapshot } from "@/data/adherenceRepo";
import { currentUserId } from "@/lib/auth";

function localDateString(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function CheatDayScreen() {
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [usedThisMonth, setUsedThisMonth] = useState(false);
  const [detail, setDetail] = useState("");
  const [celebrated, setCelebrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const now = new Date();
    const monthPrefix = localDateString(now).slice(0, 7);
    try {
      const userId = await currentUserId();
      const [adherence, lastCheat] = await Promise.all([
        userId ? buildAdherenceSnapshot(userId) : null,
        userId ? latestCheatDay(userId) : null,
      ]);
      const used = (lastCheat?.date ?? "").slice(0, 7) === monthPrefix;
      setUsedThisMonth(used);
      if (!adherence) {
        setEligible(false);
        setDetail("No tracking data yet — train consistently to unlock your cheat day.");
        return;
      }
      const isEligible = adherence.cheat_day_eligible && !used;
      setEligible(isEligible);
      if (used) {
        setDetail(
          `You've already used your cheat day this month (${lastCheat?.date ?? monthPrefix}). It renews on the first of next month — track consistently and it stays unlocked.`,
        );
      } else if (!adherence.cheat_day_eligible) {
        setDetail(
          `You have ${adherence.active_days_30} active day${adherence.active_days_30 === 1 ? "" : "s"} in the last 30 days against a target of ${adherence.target_days_30}. Reach your consistency target and your cheat day unlocks.`,
        );
      } else {
        setDetail(
          `You're on a ${adherence.streak_days}-day streak with ${adherence.logged_workouts_30} workouts logged in 30 days — you've earned a reward day.`,
        );
      }
    } catch (caught) {
      setEligible(false);
      setError(caught instanceof Error ? caught.message : "Couldn't check your cheat-day status.");
    }
  };

  useFocusEffect(
    useCallback(() => {
      setCelebrated(false);
      void load();
    }, []),
  );

  const startCheatDay = async () => {
    setError(null);
    try {
      const userId = await currentUserId();
      if (!userId) {
        setError("Sign in to record your cheat day.");
        return;
      }
      await insertCheatDay({
        id: Crypto.randomUUID(),
        userId,
        date: localDateString(new Date()),
        reason: "cheat_day",
        createdAt: new Date().toISOString(),
      });
      setUsedThisMonth(true);
      setEligible(false);
      setCelebrated(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't record your cheat day.");
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
          <Text variant="h3">Cheat Day</Text>
          <Text variant="caption" className="text-text-secondary">
            Once a month, earned by consistency
          </Text>
        </View>
        <View className="w-12" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
        {celebrated && (
          <Card variant="elevated" className="mb-6">
            <Text variant="h2" className="text-success mb-2">
              Enjoy your cheat day!
            </Text>
            <Text variant="bodySmall" className="text-text-secondary">
              Recorded for today. No guilt — get back on plan tomorrow and it
              renews next month.
            </Text>
            <View className="mt-4">
              <Button title="Done" size="lg" onPress={() => router.back()} />
            </View>
          </Card>
        )}

        {!celebrated && (
          <>
            {error && (
              <Card variant="default" className="mb-4">
                <Text variant="bodySmall" className="text-error">
                  {error}
                </Text>
              </Card>
            )}

            {eligible === null && (
              <Card variant="default" className="mb-4">
                <Text variant="bodySmall" className="text-text-secondary">
                  Checking your consistency…
                </Text>
              </Card>
            )}

            {eligible === true && (
              <Card variant="elevated" className="mb-6">
                <Text variant="h2" className="text-success mb-2">
                  {"You're eligible!"}
                </Text>
                <Text variant="bodySmall" className="text-text-secondary mb-4">
                  {detail}
                </Text>
                <Button title="Start cheat day" size="lg" onPress={() => void startCheatDay()} />
              </Card>
            )}

            {eligible === false && (
              <Card variant="default" className="mb-6">
                <Text variant="h3" className="mb-2">
                  {usedThisMonth ? "Already used this month" : "Not eligible yet"}
                </Text>
                <Text variant="bodySmall" className="text-text-secondary">
                  {detail}
                </Text>
                <View className="mt-4">
                  <Button
                    title="Ask the coach how to get there"
                    variant="secondary"
                    size="lg"
                    onPress={() => router.replace("/ai-coach")}
                  />
                </View>
              </Card>
            )}

            <Text variant="caption" className="text-text-tertiary text-center">
              Eligibility is based on your actual recorded activity — the coach
              never unlocks it from a guess.
            </Text>
          </>
        )}
      </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}