import React from "react";
import { View, Pressable, ViewStyle, StyleProp } from "react-native";
import { Text } from "./Text";
import { shadows } from "../../theme";

type CardVariant = "default" | "elevated" | "ai" | "workout" | "meal";

interface CardProps {
  variant?: CardVariant;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  onPress?: () => void;
}

const variantStyles: Record<CardVariant, string> = {
  default: "bg-surface border border-border-light",
  elevated: "bg-surface-elevated border border-border",
  ai: "bg-surface-elevated border border-ai-glow/30",
  workout: "bg-surface-elevated border border-border",
  meal: "bg-surface border border-border-light",
};

export function Card({
  variant = "default",
  children,
  style,
  className,
  onPress,
}: CardProps) {
  const classes = `${variantStyles[variant]} rounded-xxl p-5 ${className || ""}`;
  const cardStyle = [shadows.sm, style];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        className={`${classes} active:opacity-80`}
        style={cardStyle}
      >
        {children}
      </Pressable>
    );
  }

  return <View className={classes} style={cardStyle}>{children}</View>;
}

// Workout Card
interface WorkoutCardProps {
  title: string;
  duration: string;
  difficulty: string;
  muscleGroups: string[];
  exerciseCount: number;
  onPress?: () => void;
}

export function WorkoutCard({
  title,
  duration,
  difficulty,
  muscleGroups,
  exerciseCount,
  onPress,
}: WorkoutCardProps) {
  return (
    <Card variant="workout" onPress={onPress}>
      <View className="flex-row justify-between items-start mb-3">
        <Text variant="h3" className="flex-1">
          {title}
        </Text>
        <View className="bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
          <Text variant="caption" className="text-primary">
            {difficulty}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-4 mb-3">
        <View className="flex-row items-center gap-1">
          <Text variant="bodySmall" className="text-text-secondary">
            {duration}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text variant="bodySmall" className="text-text-secondary">
            {exerciseCount} exercises
          </Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {muscleGroups.map((group, index) => (
          <View
            key={index}
            className="bg-surface-highlight px-3 py-1 rounded-full"
          >
            <Text variant="caption" className="text-text-secondary">
              {group}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// Meal Card
interface MealCardProps {
  title: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  onPress?: () => void;
}

export function MealCard({
  title,
  calories,
  protein,
  carbs,
  fat,
  onPress,
}: MealCardProps) {
  return (
    <Card variant="meal" onPress={onPress}>
      <View className="flex-row justify-between items-center mb-3">
        <Text variant="h3" className="flex-1 mr-3">{title}</Text>
        <Text variant="statSmall" className="text-primary">
          {calories}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <View className="items-center">
          <Text variant="caption" className="text-text-tertiary">
            Protein
          </Text>
          <Text variant="bodySmall" className="text-text-secondary">
            {protein}g
          </Text>
        </View>
        <View className="items-center">
          <Text variant="caption" className="text-text-tertiary">
            Carbs
          </Text>
          <Text variant="bodySmall" className="text-text-secondary">
            {carbs}g
          </Text>
        </View>
        <View className="items-center">
          <Text variant="caption" className="text-text-tertiary">
            Fat
          </Text>
          <Text variant="bodySmall" className="text-text-secondary">
            {fat}g
          </Text>
        </View>
      </View>
    </Card>
  );
}

// AI Recommendation Card
interface AIRecommendationCardProps {
  title: string;
  message: string;
  actionLabel: string;
  onAction?: () => void;
}

export function AIRecommendationCard({
  title,
  message,
  actionLabel,
  onAction,
}: AIRecommendationCardProps) {
  return (
    <Card variant="ai">
      <View className="flex-row items-center gap-2 mb-3">
        <View className="w-8 h-8 rounded-full bg-ai-glow/10 border border-ai-glow/20 items-center justify-center">
          <Text variant="caption" className="text-ai-glow">
            AI
          </Text>
        </View>
        <Text variant="h3" className="text-ai-glow">
          {title}
        </Text>
      </View>
      <Text variant="body" className="text-text-secondary mb-4">
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        className="bg-ai-glow/10 border border-ai-glow/30 min-h-[48px] py-3 px-4 rounded-xl items-center active:bg-ai-glow/20"
        onPress={onAction}
      >
        <Text variant="button" className="text-ai-glow">
          {actionLabel}
        </Text>
      </Pressable>
    </Card>
  );
}
