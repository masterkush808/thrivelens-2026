import { PremiumScreen } from "@/components/brand/PremiumScreen";
import React, { useState } from "react";
import { View, ScrollView, Pressable, Dimensions, Alert } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Button, TextInput } from "@/components/ui";
import { updateCurrentProfile } from "@/data/profileRepository";
import {
  Calendar,
  Clock,
  MapPin,
  Flame,
  Dumbbell,
  Trophy,
  Heart,
  Target,
  Home,
  TreePine,
  HeartPulse,
  Zap,
} from "lucide-react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const steps = [
  "Personal Info",
  "Fitness Level",
  "Goals",
  "Workout Preferences",
  "Nutrition Preferences",
];

const fitnessLevels = [
  { id: "beginner", title: "Beginner", description: "New to fitness" },
  { id: "intermediate", title: "Intermediate", description: "6+ months experience" },
  { id: "advanced", title: "Advanced", description: "2+ years experience" },
];

const goals = [
  { id: "lose-fat", title: "Lose Fat", subtitle: "Burn calories & get lean", Icon: Flame, color: "#FF6B35" },
  { id: "build-muscle", title: "Build Muscle", subtitle: "Increase muscle mass", Icon: Dumbbell, color: "#E7BE73" },
  { id: "gain-strength", title: "Gain Strength", subtitle: "Boost power & endurance", Icon: Trophy, color: "#FFB340" },
  { id: "improve-fitness", title: "Improve Fitness", subtitle: "Enhance overall health", Icon: Heart, color: "#FF3B61" },
  { id: "maintain-weight", title: "Maintain Weight", subtitle: "Stay in shape", Icon: Target, color: "#34C759" },
];

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - 60) / 2;

function AnimatedGoalCard({
  goal,
  isSelected,
  onPress,
}: {
  goal: (typeof goals)[number];
  isSelected: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    // eslint-disable-next-line react-hooks/immutability -- shared value ref, not React state
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    // eslint-disable-next-line react-hooks/immutability -- shared value ref, not React state
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const IconComponent = goal.Icon;

  return (
    <Animated.View style={[{ width: CARD_WIDTH }, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: isSelected ? `${goal.color}15` : "#181611",
          borderWidth: 1.5,
          borderColor: isSelected ? goal.color : "#40382A",
        }}
      >
        {/* Glow background */}
        <View className="items-center pt-6 pb-4">
          <View className="relative">
            <Svg width={80} height={80} viewBox="0 0 80 80">
              <Defs>
                <RadialGradient id={`glow-${goal.id}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={goal.color} stopOpacity={isSelected ? 0.3 : 0.08} />
                  <Stop offset="100%" stopColor={goal.color} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx="40" cy="40" r="40" fill={`url(#glow-${goal.id})`} />
            </Svg>
            <View
              className="absolute inset-0 items-center justify-center"
              style={{
                width: 80,
                height: 80,
              }}
            >
              <IconComponent
                size={32}
                color={isSelected ? goal.color : "#ABA291"}
                strokeWidth={1.8}
              />
            </View>
          </View>
        </View>

        {/* Label */}
        <View className="px-4 pb-5">
          <Text
            variant="body"
            className="font-bold text-center"
            style={{ color: isSelected ? goal.color : "#FAF6EE" }}
          >
            {goal.title}
          </Text>
          <Text
            variant="caption"
            className="text-center mt-1"
            style={{ color: isSelected ? goal.color : "#ABA291" }}
          >
            {goal.subtitle}
          </Text>
        </View>

        {/* Selected indicator */}
        {isSelected && (
          <View
            className="absolute top-3 right-3 w-5 h-5 rounded-full items-center justify-center"
            style={{ backgroundColor: goal.color }}
          >
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
              <Path
                d="M5 12l5 5L20 7"
                stroke="#171208"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    height: "",
    weight: "",
    fitnessLevel: "",
    goal: "",
    goalTimeline: "",
    daysPerWeek: "3",
    sessionDuration: "45",
    location: "gym",
    workoutType: "",
    calorieTarget: "2200",
    proteinTarget: "165",
    dietaryPreference: "None",
  });

  const handleNext = async () => {
    if (currentStep === 3) {
      const days = parseInt(formData.daysPerWeek);
      const duration = parseInt(formData.sessionDuration);
      if (!days || days < 1 || days > 7) return;
      if (!duration || duration < 10 || duration > 180) return;
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      try {
        await updateCurrentProfile({
          display_name: formData.name.trim() || null,
          age: Number(formData.age) || null,
          height: Number(formData.height) || null,
          weight: Number(formData.weight) || null,
          experience: formData.fitnessLevel || null,
          goal: formData.goal || null,
          goal_timeline: formData.goalTimeline || null,
          onboarding_completed: true,
          calorie_target: Number(formData.calorieTarget) || null,
          protein_target: Number(formData.proteinTarget) || null,
          dietary_preference: formData.dietaryPreference,
          training_days_per_week: Number(formData.daysPerWeek) || null,
          session_duration_minutes: Number(formData.sessionDuration) || null,
          workout_location: formData.location,
          workout_type: formData.workoutType || null,
        });
        router.replace("/(tabs)");
      } catch (error) {
        Alert.alert(
          "Unable to save setup",
          error instanceof Error ? error.message : "Check your connection and try again.",
        );
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <View className="gap-4">
            <TextInput
              label="Name"
              placeholder="Enter your name"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
            />
            <TextInput
              label="Age"
              placeholder="Enter your age"
              value={formData.age}
              onChangeText={(text) => setFormData({ ...formData, age: text })}
              keyboardType="numeric"
            />
            <View className="flex-row gap-3">
              <TextInput
                label="Height (cm)"
                placeholder="175"
                value={formData.height}
                onChangeText={(text) => setFormData({ ...formData, height: text })}
                keyboardType="numeric"
                containerStyle={{ flex: 1 }}
              />
              <TextInput
                label="Weight (kg)"
                placeholder="70"
                value={formData.weight}
                onChangeText={(text) => setFormData({ ...formData, weight: text })}
                keyboardType="numeric"
                containerStyle={{ flex: 1 }}
              />
            </View>
          </View>
        );

      case 1:
        return (
          <View className="gap-3">
            {fitnessLevels.map((level) => (
              <Pressable
                key={level.id}
                className={`p-4 rounded-xl border ${
                  formData.fitnessLevel === level.id
                    ? "bg-primary/10 border-primary"
                    : "bg-surface border-border"
                }`}
                onPress={() =>
                  setFormData({ ...formData, fitnessLevel: level.id })
                }
              >
                <Text variant="body" className="font-semibold">
                  {level.title}
                </Text>
                <Text variant="bodySmall" className="text-text-secondary">
                  {level.description}
                </Text>
              </Pressable>
            ))}
          </View>
        );

      case 2:
        return (
          <View className="gap-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Target size={20} color="#E7BE73" strokeWidth={2} />
              <Text variant="bodySmall" className="text-text-secondary">
                Select your primary fitness goal
              </Text>
            </View>
            <View className="flex-row flex-wrap justify-between gap-3">
              {goals.map((goal) => (
                <AnimatedGoalCard
                  key={goal.id}
                  goal={goal}
                  isSelected={formData.goal === goal.id}
                  onPress={() => setFormData({ ...formData, goal: goal.id })}
                />
              ))}
            </View>
            <View>
              <View className="flex-row items-center gap-2 mb-3">
                <Clock size={18} color="#FFB340" />
                <Text variant="bodySmall" className="text-text-secondary">
                  How long to give yourself?
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {["3 months", "6 months", "12 months"].map((timeline) => {
                  const isSelected = formData.goalTimeline === timeline;
                  return (
                    <Pressable
                      key={timeline}
                      className={`px-4 py-2 rounded-full border ${
                        isSelected
                          ? "bg-primary border-primary"
                          : "bg-surface-highlight border-border"
                      }`}
                      onPress={() => setFormData({ ...formData, goalTimeline: timeline })}
                    >
                      <Text
                        variant="caption"
                        className={isSelected ? "text-text-inverse" : "text-text-secondary"}
                      >
                        {timeline}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        );

      case 3:
        return (
          <View className="gap-5">
            {/* Days per week */}
            <View>
              <View className="flex-row items-center gap-2 mb-3">
                <Calendar size={18} color="#E7BE73" />
                <Text variant="body" className="text-text-secondary font-medium">
                  Training days
                </Text>
              </View>
              <View className="flex-row gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                  const isSelected = formData.daysPerWeek === String(day);
                  return (
                    <Pressable
                      key={day}
                      className="flex-1 h-12 rounded-xl items-center justify-center"
                      style={{
                        backgroundColor: isSelected ? "#E7BE73" : "#181611",
                        borderWidth: 1.5,
                        borderColor: isSelected ? "#E7BE73" : "#40382A",
                      }}
                      onPress={() =>
                        setFormData({ ...formData, daysPerWeek: String(day) })
                      }
                    >
                      <Text
                        variant="body"
                        className="font-bold"
                        style={{ color: isSelected ? "#171208" : "#ABA291" }}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text variant="caption" className="text-text-tertiary mt-2 text-center">
                {formData.daysPerWeek} days per week
              </Text>
            </View>

            {/* Session duration */}
            <View>
              <View className="flex-row items-center gap-2 mb-3">
                <Clock size={18} color="#FF6B35" />
                <Text variant="body" className="text-text-secondary font-medium">
                  Session length
                </Text>
              </View>
              <View className="flex-row gap-2">
                {["15", "30", "45", "60", "90"].map((dur) => {
                  const isSelected = formData.sessionDuration === dur;
                  return (
                    <Pressable
                      key={dur}
                      className="flex-1 h-12 rounded-xl items-center justify-center"
                      style={{
                        backgroundColor: isSelected ? "#FF6B35" : "#181611",
                        borderWidth: 1.5,
                        borderColor: isSelected ? "#FF6B35" : "#40382A",
                      }}
                      onPress={() =>
                        setFormData({ ...formData, sessionDuration: dur })
                      }
                    >
                      <Text
                        variant="caption"
                        className="font-bold"
                        style={{ color: isSelected ? "#171208" : "#ABA291" }}
                      >
                        {dur}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text variant="caption" className="text-text-tertiary mt-2 text-center">
                {formData.sessionDuration} minutes per session
              </Text>
            </View>

            {/* Workout Location */}
            <View>
              <View className="flex-row items-center gap-2 mb-3">
                <MapPin size={18} color="#34C759" />
                <Text variant="body" className="text-text-secondary font-medium">
                  Workout location
                </Text>
              </View>
              <View className="flex-row gap-3">
                {[
                  { id: "gym", label: "Gym", Icon: Dumbbell, color: "#E7BE73" },
                  { id: "home", label: "Home", Icon: Home, color: "#FF6B35" },
                  { id: "outdoor", label: "Outdoor", Icon: TreePine, color: "#34C759" },
                ].map((loc) => {
                  const isSelected = formData.location === loc.id;
                  return (
                    <Pressable
                      key={loc.id}
                      className="flex-1 items-center py-4 rounded-2xl"
                      style={{
                        backgroundColor: isSelected ? `${loc.color}15` : "#181611",
                        borderWidth: 1.5,
                        borderColor: isSelected ? loc.color : "#40382A",
                      }}
                      onPress={() => setFormData({ ...formData, location: loc.id })}
                    >
                      <View className="relative mb-2">
                        <Svg width={48} height={48} viewBox="0 0 48 48">
                          <Defs>
                            <RadialGradient id={`loc-${loc.id}`} cx="50%" cy="50%" r="50%">
                              <Stop offset="0%" stopColor={loc.color} stopOpacity={isSelected ? 0.25 : 0.06} />
                              <Stop offset="100%" stopColor={loc.color} stopOpacity={0} />
                            </RadialGradient>
                          </Defs>
                          <Circle cx="24" cy="24" r="24" fill={`url(#loc-${loc.id})`} />
                        </Svg>
                        <View className="absolute inset-0 items-center justify-center" style={{ width: 48, height: 48 }}>
                          <loc.Icon
                            size={22}
                            color={isSelected ? loc.color : "#ABA291"}
                            strokeWidth={1.8}
                          />
                        </View>
                      </View>
                      <Text
                        variant="bodySmall"
                        className="font-semibold"
                        style={{ color: isSelected ? loc.color : "#C7BFAF" }}
                      >
                        {loc.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Workout Type */}
            <View>
              <View className="flex-row items-center gap-2 mb-3">
                <Zap size={18} color="#FFB340" />
                <Text variant="body" className="text-text-secondary font-medium">
                  Preferred workout type
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {[
                  { id: "strength", label: "Strength", Icon: Dumbbell, color: "#E7BE73" },
                  { id: "cardio", label: "Cardio", Icon: HeartPulse, color: "#FF3B61" },
                  { id: "hiit", label: "HIIT", Icon: Flame, color: "#FF6B35" },
                  { id: "flexibility", label: "Stretching", Icon: Target, color: "#34C759" },
                ].map((type) => {
                  const isSelected = formData.workoutType === type.id;
                  return (
                    <Pressable
                      key={type.id}
                      className="flex-row items-center gap-2 px-4 py-3 rounded-xl"
                      style={{
                        backgroundColor: isSelected ? `${type.color}15` : "#181611",
                        borderWidth: 1.5,
                        borderColor: isSelected ? type.color : "#40382A",
                      }}
                      onPress={() => setFormData({ ...formData, workoutType: type.id })}
                    >
                      <type.Icon
                        size={16}
                        color={isSelected ? type.color : "#ABA291"}
                        strokeWidth={2}
                      />
                      <Text
                        variant="bodySmall"
                        className="font-semibold"
                        style={{ color: isSelected ? type.color : "#C7BFAF" }}
                      >
                        {type.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        );

      case 4:
        return (
          <View className="gap-4">
            <TextInput
              label="Daily calorie target"
              placeholder="2200"
              value={formData.calorieTarget}
              onChangeText={(text) => setFormData({ ...formData, calorieTarget: text })}
              keyboardType="numeric"
            />
            <TextInput
              label="Protein target (g)"
              placeholder="165"
              value={formData.proteinTarget}
              onChangeText={(text) => setFormData({ ...formData, proteinTarget: text })}
              keyboardType="numeric"
            />
            <View>
              <Text variant="body" className="text-text-secondary mb-2">
                Dietary preferences
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {["None", "Vegetarian", "Vegan", "Keto", "Paleo"].map(
                  (pref) => (
                    <Pressable
                      key={pref}
                      className="px-4 py-2 rounded-full bg-surface border border-border"
                      onPress={() => setFormData({ ...formData, dietaryPreference: pref })}
                      style={formData.dietaryPreference === pref ? { borderColor: "#E7BE73" } : undefined}
                    >
                      <Text variant="bodySmall" className="text-text-secondary">
                        {pref}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <PremiumScreen>
    <SafeAreaView className="flex-1 bg-transparent">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6 pt-8 pb-6">
          {/* Progress */}
          <View className="mb-8">
            <View className="flex-row justify-between mb-2">
              <Text variant="caption" className="text-text-secondary">
                Step {currentStep + 1} of {steps.length}
              </Text>
              <Text variant="caption" className="text-primary">
                {Math.round(((currentStep + 1) / steps.length) * 100)}%
              </Text>
            </View>
            <View className="h-2 bg-surface rounded-full overflow-hidden">
              <View
                className="h-full bg-primary rounded-full"
                style={{
                  width: `${((currentStep + 1) / steps.length) * 100}%`,
                }}
              />
            </View>
          </View>

          {/* Step Title */}
          <View className="mb-8">
            <Text variant="h1" className="mb-2">
              {steps[currentStep]}
            </Text>
            <Text variant="body" className="text-text-secondary">
              {currentStep === 0 && "Tell us about yourself"}
              {currentStep === 1 && "What's your experience level?"}
              {currentStep === 2 && "What do you want to achieve?"}

              {currentStep === 3 && "How do you like to train?"}
              {currentStep === 4 && "Set your nutrition targets"}
            </Text>
          </View>

          {/* Step Content */}
          <View className="flex-1">{renderStep()}</View>

          {/* Navigation */}
          <View className="gap-3 mt-8">
            <Button
              title={
                currentStep === steps.length - 1 ? "Complete Setup" : "Continue"
              }
              size="lg"
              onPress={handleNext}
            />
            {currentStep > 0 && (
              <Button
                title="Back"
                variant="ghost"
                size="lg"
                onPress={handleBack}
              />
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
    </PremiumScreen>
  );
}
