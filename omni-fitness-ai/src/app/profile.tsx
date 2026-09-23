import { PremiumScreen } from "@/components/brand/PremiumScreen";
import React, { useEffect, useState } from "react";
import { View, ScrollView, Pressable, Alert, Share } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, Settings, LogOut, Bell, Moon, Shield, HelpCircle, Camera } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { Text, Card, Avatar } from "@/components/ui";
import { useAuth } from "@/providers/AuthProvider";
import { getCurrentProfile, Profile, updateCurrentProfile, exportAccountData, deleteCurrentAccount } from "@/data/profileRepository";

const menuItems = [
  { icon: Settings, label: "Settings", color: "#C7BFAF" },
  { icon: Bell, label: "Notifications", color: "#C7BFAF" },
  { icon: Moon, label: "Appearance", color: "#C7BFAF" },
  { icon: Shield, label: "Privacy & Security", color: "#C7BFAF" },
  { icon: HelpCircle, label: "Help & Support", color: "#C7BFAF" },
  { icon: LogOut, label: "Sign Out", color: "#FF3B30" },
];

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);

  useEffect(() => {
    getCurrentProfile()
      .then((nextProfile) => {
        setProfile(nextProfile);
        setImageUri(nextProfile.avatar_url ?? undefined);
      })
      .catch((error: unknown) => {
        Alert.alert("Unable to load profile", error instanceof Error ? error.message : "Try again.");
      });
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please grant camera roll access to change your profile photo.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      try {
        await updateCurrentProfile({ avatar_url: uri });
        setImageUri(uri);
      } catch (error) {
        Alert.alert("Unable to save photo", error instanceof Error ? error.message : "Try again.");
      }
    }
  };

  const handleExport = async () => {
    if (!profile) return;
    try {
      const exportData = await exportAccountData(profile.id);
      await Share.share({
        title: "Thrive Lens account export",
        message: JSON.stringify(exportData, null, 2),
      });
    } catch (error) {
      Alert.alert("Unable to export data", error instanceof Error ? error.message : "Try again.");
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete account", "This permanently deletes your profile and all account data.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await deleteCurrentAccount();
          } catch (error) {
            Alert.alert("Unable to delete account", error instanceof Error ? error.message : "Try again.");
          }
        },
      },
    ]);
  };

  return (
    <PremiumScreen>
    <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center px-6 py-4">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-elevated items-center justify-center mr-4"
          >
            <ChevronLeft size={20} color="#FAF6EE" />
          </Pressable>
          <Text variant="h2">Profile</Text>
        </View>

        <View className="items-center px-6 mb-8">
          <Pressable onPress={pickImage} className="relative">
            <Avatar uri={imageUri} initials="A" size="xl" />
            <View className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary items-center justify-center border-2 border-background">
              <Camera size={14} color="#171208" />
            </View>
          </Pressable>
          <Text variant="h2" className="mt-4">
            {profile?.display_name ?? "Your profile"}
          </Text>
          <Text variant="body" className="text-text-secondary mt-1">
            {profile?.id ? "Account profile" : "Loading profile..."}
          </Text>
          <Text variant="caption" className="text-text-tertiary mt-1">
            Tap photo to change
          </Text>
        </View>

        <View className="px-6 mb-6">
          <Card variant="elevated">
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Text variant="stat" className="text-primary">
                  {profile?.weight ?? "--"}
                </Text>
                <Text variant="caption" className="text-text-secondary">
                  Weight (kg)
                </Text>
              </View>
              <View className="items-center flex-1">
                <Text variant="stat" className="text-accent">
                  {profile?.height ?? "--"}
                </Text>
                <Text variant="caption" className="text-text-secondary">
                  Height (cm)
                </Text>
              </View>
              <View className="items-center flex-1">
                <Text variant="stat" className="text-success">
                  {profile?.age ?? "--"}
                </Text>
                <Text variant="caption" className="text-text-secondary">
                  Age
                </Text>
              </View>
            </View>
          </Card>
        </View>

        <View className="px-6">
          {menuItems.map((item, index) => (
            <Pressable
              key={index}
              className="flex-row items-center py-4 border-b border-border-light"
              onPress={async () => {
                if (item.label === "Settings") return handleExport();
                if (item.label === "Privacy & Security") return handleDelete();
                if (item.label !== "Sign Out") return;
                try {
                  await signOut();
                } catch (error) {
                  Alert.alert("Unable to sign out", error instanceof Error ? error.message : "Try again.");
                }
              }}
            >
              <View className="w-10 h-10 rounded-full bg-surface-elevated items-center justify-center mr-4">
                <item.icon size={18} color={item.color} />
              </View>
              <Text variant="body" className={item.label === "Sign Out" ? "text-error" : "text-text-primary"}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
    </PremiumScreen>
  );
}
