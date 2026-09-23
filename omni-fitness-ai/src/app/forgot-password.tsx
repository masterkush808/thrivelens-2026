import { PremiumScreen } from '@/components/brand/PremiumScreen';
import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ArrowLeft, Mail } from "lucide-react-native";
import { sendPasswordResetEmail } from "@/lib/auth";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert("Missing email", "Enter the email address for your account.");
      return;
    }

    setIsLoading(true);
    const { error } = await sendPasswordResetEmail(email.trim());
    setIsLoading(false);

    if (error) {
      Alert.alert("Unable to send reset email", error.message, [
        { text: "Back to sign in", onPress: () => router.replace("/signin") },
      ]);
      return;
    }

    Alert.alert("Check your email", "Use the link to choose a new password.", [
      { text: "Back to sign in", onPress: () => router.replace("/signin") },
    ]);
  };

  return (
    <PremiumScreen>
    <LinearGradient colors={["transparent", "transparent", "transparent"]} style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={20} color="#FAF6EE" />
        </TouchableOpacity>
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>We will send a secure reset link to your account email.</Text>
        <View style={styles.inputContainer}>
          <Mail size={18} color="#ABA291" />
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor="#ABA291"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </View>
        <TouchableOpacity onPress={handleSubmit} disabled={isLoading} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{isLoading ? "Sending..." : "Send reset link"}</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 24, paddingTop: 64 },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#221F18",
    alignItems: "center", justifyContent: "center", marginBottom: 32,
  },
  title: { color: "#FAF6EE", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#C7BFAF", fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 28 },
  inputContainer: {
    flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1,
    borderColor: "#40382A", backgroundColor: "#181611", paddingHorizontal: 16,
  },
  input: { flex: 1, paddingVertical: 16, color: "#FAF6EE", fontSize: 16 },
  primaryButton: { marginTop: 24, borderRadius: 16, paddingVertical: 16, alignItems: "center", backgroundColor: "#E7BE73" },
  primaryButtonText: { color: "#171208", fontSize: 17, fontWeight: "600" },
});
