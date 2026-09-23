import { PremiumScreen } from "@/components/brand/PremiumScreen";
import React from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  ArrowLeft,
  Dumbbell,
  Clock,
  BarChart3,
  Weight,
  Target,
} from "lucide-react-native";
import { Text } from "@/components/ui";

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

export default function ExerciseDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    name: string;
    bodyPart: string;
    type: string;
    equipment: string;
    mechanics: string;
    level: string;
    videoPath: string;
    description: string;
  }>();

  const color = bodyPartColors[params.bodyPart || "chest"] || "#E7BE73";
  
  const player = useVideoPlayer(
    params.videoPath ? { uri: params.videoPath } : null,
    (player) => {
      player.loop = true;
    }
  );

  return (
    <PremiumScreen>
      <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-border">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface items-center justify-center mr-3"
          >
            <ArrowLeft size={20} color="#FAF6EE" />
          </Pressable>
          <Text variant="h2" className="flex-1" numberOfLines={1}>
            {params.name || "Exercise"}
          </Text>
        </View>

        {/* Video Section */}
        <View className="px-4 py-4">
          <View
            className="rounded-2xl overflow-hidden border border-border"
            style={{ aspectRatio: 16 / 9 }}
          >
            {params.videoPath ? (
              <VideoView
                player={player}
                style={styles.video}
                contentFit="contain"
                nativeControls
              />
            ) : (
              <View
                className="w-full h-full items-center justify-center"
                style={{ backgroundColor: `${color}20` }}
              >
                <View
                  className="w-20 h-20 rounded-full items-center justify-center"
                  style={{ backgroundColor: color }}
                >
                  <Dumbbell size={36} color="#171208" />
                </View>
                <Text variant="body" className="text-text-primary font-semibold mt-4">
                  No Video Available
                </Text>
                <Text variant="bodySmall" className="text-text-secondary mt-1">
                  Record this exercise to add a video
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Exercise Info */}
        <View className="px-4">
          {/* Title and Body Part */}
          <View className="mb-4">
            <Text variant="h1" className="text-text-primary">
              {params.name}
            </Text>
            <View className="flex-row items-center mt-2 gap-2">
              <View
                className="px-3 py-1 rounded-full"
                style={{ backgroundColor: `${color}30` }}
              >
                <Text variant="bodySmall" style={{ color }}>
                  {(params.bodyPart || "").charAt(0).toUpperCase() +
                    (params.bodyPart || "").slice(1)}
                </Text>
              </View>
            </View>
          </View>

          {/* Stats Grid */}
          <View className="flex-row flex-wrap gap-3 mb-6">
            <View className="bg-surface rounded-xl p-3 border border-border flex-1 min-w-[45%]">
              <View className="flex-row items-center gap-2 mb-1">
                <Target size={16} color={color} />
                <Text variant="caption" className="text-text-secondary">
                  Type
                </Text>
              </View>
              <Text variant="body" className="font-semibold text-text-primary">
                {params.type || "Strength"}
              </Text>
            </View>

            <View className="bg-surface rounded-xl p-3 border border-border flex-1 min-w-[45%]">
              <View className="flex-row items-center gap-2 mb-1">
                <Weight size={16} color={color} />
                <Text variant="caption" className="text-text-secondary">
                  Equipment
                </Text>
              </View>
              <Text variant="body" className="font-semibold text-text-primary">
                {params.equipment || "Barbell"}
              </Text>
            </View>

            <View className="bg-surface rounded-xl p-3 border border-border flex-1 min-w-[45%]">
              <View className="flex-row items-center gap-2 mb-1">
                <BarChart3 size={16} color={color} />
                <Text variant="caption" className="text-text-secondary">
                  Mechanics
                </Text>
              </View>
              <Text variant="body" className="font-semibold text-text-primary">
                {params.mechanics || "Compound"}
              </Text>
            </View>

            <View className="bg-surface rounded-xl p-3 border border-border flex-1 min-w-[45%]">
              <View className="flex-row items-center gap-2 mb-1">
                <Clock size={16} color={color} />
                <Text variant="caption" className="text-text-secondary">
                  Level
                </Text>
              </View>
              <Text variant="body" className="font-semibold text-text-primary">
                {params.level || "Beginner"}
              </Text>
            </View>
          </View>

          {/* Description */}
          <View className="mb-6">
            <Text variant="h3" className="mb-3">
              About This Exercise
            </Text>
            <Text variant="body" className="text-text-secondary leading-6">
              {params.description ||
                "This is a great exercise for building strength and muscle mass."}
            </Text>
          </View>

          {/* Tips */}
          <View className="mb-6">
            <Text variant="h3" className="mb-3">
              Tips
            </Text>
            <View className="gap-3">
              <View className="flex-row items-start gap-3">
                <View
                  className="w-6 h-6 rounded-full items-center justify-center mt-0.5"
                  style={{ backgroundColor: `${color}30` }}
                >
                  <Text variant="caption" style={{ color }}>
                    1
                  </Text>
                </View>
                <Text variant="body" className="text-text-secondary flex-1">
                  Focus on proper form before increasing weight
                </Text>
              </View>
              <View className="flex-row items-start gap-3">
                <View
                  className="w-6 h-6 rounded-full items-center justify-center mt-0.5"
                  style={{ backgroundColor: `${color}30` }}
                >
                  <Text variant="caption" style={{ color }}>
                    2
                  </Text>
                </View>
                <Text variant="body" className="text-text-secondary flex-1">
                  Control the weight through the full range of motion
                </Text>
              </View>
              <View className="flex-row items-start gap-3">
                <View
                  className="w-6 h-6 rounded-full items-center justify-center mt-0.5"
                  style={{ backgroundColor: `${color}30` }}
                >
                  <Text variant="caption" style={{ color }}>
                    3
                  </Text>
                </View>
                <Text variant="body" className="text-text-secondary flex-1">
                  Breathe out during the exertion phase
                </Text>
              </View>
            </View>
          </View>

          {/* Source */}
          <View className="bg-surface rounded-xl p-4 border border-border">
            <Text variant="caption" className="text-text-secondary">
              Exercise data powered by Thrive Lens AI
            </Text>
          </View>
        </View>
      </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  video: {
    flex: 1,
    backgroundColor: "#000",
  },
});
