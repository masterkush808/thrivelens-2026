import React from "react";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { Home, Dumbbell, BarChart3, Utensils, MapPin, Bot } from "lucide-react-native";
import { colors } from "@/theme";

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
    Home,
    Workout: Dumbbell,
    Tracking: BarChart3,
    Nutrition: Utensils,
    Maps: MapPin,
    "AI Coach": Bot,
  };

  const Icon = icons[name] || Home;
  const color = focused ? colors.primary : "#6B6B80";

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Icon size={24} color={color} strokeWidth={focused ? 2.1 : 1.8} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: "#6B6B80",
        tabBarStyle: {
          backgroundColor: "#13110E",
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          lineHeight: 15,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon name="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          title: "Workout",
          tabBarIcon: ({ focused }) => <TabIcon name="Workout" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          title: "Tracking",
          tabBarIcon: ({ focused }) => <TabIcon name="Tracking" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: "Nutrition",
          tabBarIcon: ({ focused }) => <TabIcon name="Nutrition" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="maps"
        options={{
          title: "Maps",
          tabBarIcon: ({ focused }) => <TabIcon name="Maps" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="ai-coach"
        options={{
          title: "AI Coach",
          tabBarIcon: ({ focused }) => <TabIcon name="AI Coach" focused={focused} />,
        }}
      />
    </Tabs>
  );
}