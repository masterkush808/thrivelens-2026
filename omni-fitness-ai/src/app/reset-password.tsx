import { PremiumScreen } from '@/components/brand/PremiumScreen';
import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Lock } from "lucide-react-native";
import { updatePassword } from "@/lib/auth";

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (password.length < 6) {
      Alert.alert("Password too short", "Use at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "The passwords do not match.");
      return;
    }

    setIsLoading(true);
    const { error } = await updatePassword(password);
    setIsLoading(false);
    if (error) {
      Alert.alert("Unable to update password", error.message, [
        { text: "Back to sign in", onPress: () => router.replace("/signin") },
      ]);
      return;
    }
    Alert.alert("Password updated", "You can now continue to your account.", [
      { text: "Continue", onPress: () => router.replace("/(tabs)") },
    ]);
  };

  return (
    <PremiumScreen>
    <LinearGradient colors={["transparent", "transparent", "transparent"]} style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Choose a new password</Text>
        <Text style={styles.subtitle}>Your reset link is valid. Set a new password to secure your account.</Text>
        <PasswordInput value={password} onChangeText={setPassword} placeholder="New password" />
        <PasswordInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" />
        <TouchableOpacity onPress={handleSubmit} disabled={isLoading} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{isLoading ? "Updating..." : "Update password"}</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
    </PremiumScreen>
  );
}

function PasswordInput({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <View style={styles.inputContainer}>
      <Lock size={18} color="#ABA291" />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#ABA291"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 24, paddingTop: 96 },
  title: { color: "#FAF6EE", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#C7BFAF", fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 28 },
  inputContainer: {
    flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1,
    borderColor: "#40382A", backgroundColor: "#181611",
    paddingHorizontal: 16, marginBottom: 14,
  },
  input: { flex: 1, paddingVertical: 16, color: "#FAF6EE", fontSize: 16 },
  primaryButton: { marginTop: 10, borderRadius: 16, paddingVertical: 16, alignItems: "center", backgroundColor: "#E7BE73" },
  primaryButtonText: { color: "#171208", fontSize: 17, fontWeight: "600" },
});
