import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { InspirationProvider } from "@/providers/InspirationProvider";
import { LaunchInspiration } from "@/components/brand/LaunchInspiration";
import { useMotionPreferences } from "@/hooks/useMotionPreferences";
import { colors } from "@/theme";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { getCurrentProfile } from "@/data/profileRepository";
import "./global.css";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <InspirationProvider>
          <StatusBar style="light" />
          <AuthGate />
        </InspirationProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

function AuthGate() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { reduceMotion } = useMotionPreferences();

  useEffect(() => {
    if (isLoading) return;

    const rootSegment = segments[0];
    const isAuthRoute =
      rootSegment === "welcome" ||
      rootSegment === "signin" ||
      rootSegment === "signup" ||
      rootSegment === "forgot-password" ||
      rootSegment === "reset-password";

    if (!user) {
      if (!isAuthRoute && rootSegment !== "onboarding") {
        router.replace("/welcome");
      }
      return;
    }

    void (async () => {
      let onboardingCompleted = true;
      try {
        const profile = await getCurrentProfile();
        onboardingCompleted = profile.onboarding_completed;
      } catch {
        onboardingCompleted = true;
      }

      const target = onboardingCompleted ? "/(tabs)" : "/onboarding";
      if (isAuthRoute || (rootSegment === "onboarding" && onboardingCompleted)) {
        router.replace(target);
      } else if (!onboardingCompleted && rootSegment !== "onboarding") {
        router.replace("/onboarding");
      }
    })();
  }, [isLoading, router, segments, user]);

  if (isLoading) return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <Image source={require('../../assets/images/297b11a4-1998-4a78-8749-65a9fd0d3ba0.png')}
        style={{ width: 260, height: 260 }} resizeMode="contain" accessibilityLabel="Thrive Lens" />
      <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your session" />
    </View>
  );

  return (
    <>
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: reduceMotion ? "none" : "fade",
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="signin" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="exercise-library" />
      <Stack.Screen name="exercise-detail" />
      <Stack.Screen name="ai-coach" options={{ presentation: "modal" }} />
      <Stack.Screen name="food-scanner" options={{ presentation: "modal" }} />
      <Stack.Screen name="profile" options={{ animation: reduceMotion ? "none" : "slide_from_right" }} />
      <Stack.Screen name="meal-plans" options={{ presentation: "modal" }} />
      <Stack.Screen name="fridge" options={{ presentation: "modal" }} />
      <Stack.Screen name="cheat-day" options={{ presentation: "modal" }} />
    </Stack>
    <LaunchInspiration eligible={Boolean(user) && segments[0] === '(tabs)' && (!segments[1] || String(segments[1]) === 'index')} />
    </>
  );
}
