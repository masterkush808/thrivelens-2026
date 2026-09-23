import { PremiumScreen } from '@/components/brand/PremiumScreen';
import { View, Text, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { signInWithProvider, signUpWithEmail } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/supabase';
import { ArrowLeft, User, Mail, Lock, Eye, EyeOff } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </Svg>
  );
}

function AppleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FAF6EE">
      <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  );
}

export default function SignUp() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getPasswordStrength = (pass: string) => {
    if (pass.length === 0) return { level: 0, label: '', color: 'transparent' };
    if (pass.length < 6) return { level: 1, label: 'Weak', color: '#EF4444' };
    if (pass.length < 10) return { level: 2, label: 'Medium', color: '#F59E0B' };
    return { level: 3, label: 'Strong', color: '#10B981' };
  };

  const strength = getPasswordStrength(password);

  const handleSignUp = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    setIsLoading(true);
    const { error, needsEmailConfirmation } = await signUpWithEmail(
      email.trim(),
      password,
      fullName.trim(),
    );
    setIsLoading(false);
    if (error) {
      Alert.alert('Unable to create account', error.message);
      return;
    }
    if (needsEmailConfirmation) {
      Alert.alert('Check your email', 'Confirm your email address, then sign in to continue.');
      router.replace('/signin');
      return;
    }
    router.replace('/onboarding');
  };

  const handleProviderSignUp = async (provider: 'google' | 'apple') => {
    if (!supabaseConfigured) {
      Alert.alert(
        'Not available in local mode',
        'Social sign-in needs a hosted account backend (Supabase). Use the email form to create a local account.',
      );
      return;
    }
    setIsLoading(true);
    try {
      await signInWithProvider(provider);
      router.replace('/onboarding');
    } catch (error) {
      Alert.alert('Unable to create account', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PremiumScreen>
    <LinearGradient colors={['transparent', 'transparent', 'transparent']} style={styles.container}>
      <View style={styles.bgContainer} pointerEvents="none">
        <View style={[styles.glow, { width: 250, height: 250, top: -80, right: -80, backgroundColor: 'rgba(231,190,115,0.08)' }]} />
        <View style={[styles.glow, { width: 200, height: 200, bottom: 100, left: -100, backgroundColor: 'rgba(245,220,167,0.06)' }]} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ArrowLeft size={20} color="#FAF6EE" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Start your fitness journey today</Text>
            </View>
          </View>

          {/* Form Fields */}
          <View style={styles.form}>
            <InputField
              icon={<User size={18} color={focusedField === 'name' ? '#E7BE73' : '#ABA291'} />}
              placeholder="Full Name"
              value={fullName}
              onChangeText={setFullName}
              isFocused={focusedField === 'name'}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="words"
            />

            <InputField
              icon={<Mail size={18} color={focusedField === 'email' ? '#E7BE73' : '#ABA291'} />}
              placeholder="Email Address"
              value={email}
              onChangeText={setEmail}
              isFocused={focusedField === 'email'}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <InputField
              icon={<Lock size={18} color={focusedField === 'password' ? '#E7BE73' : '#ABA291'} />}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              isFocused={focusedField === 'password'}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              secureTextEntry={!showPassword}
              showPasswordToggle
              isPasswordVisible={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
            />

            <InputField
              icon={<Lock size={18} color={focusedField === 'confirm' ? '#E7BE73' : '#ABA291'} />}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              isFocused={focusedField === 'confirm'}
              onFocus={() => setFocusedField('confirm')}
              onBlur={() => setFocusedField(null)}
              secureTextEntry={!showConfirmPassword}
              showPasswordToggle
              isPasswordVisible={showConfirmPassword}
              onTogglePassword={() => setShowConfirmPassword(!showConfirmPassword)}
            />
          </View>

          {/* Password Strength Indicator */}
          {password.length > 0 && (
            <View style={styles.strengthContainer}>
              <View style={styles.strengthHeader}>
                <Text style={styles.strengthLabel}>Password strength</Text>
                <Text style={[styles.strengthValue, { color: strength.color }]}>{strength.label}</Text>
              </View>
              <View style={styles.strengthBars}>
                {[1, 2, 3].map((level) => (
                  <View key={level} style={styles.strengthBarBg}>
                    <View style={[styles.strengthBarFill, {
                      width: strength.level >= level ? '100%' : '0%',
                      backgroundColor: strength.color,
                    }]} />
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Create Account Button */}
          <TouchableOpacity onPress={handleSignUp} disabled={isLoading} style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>{isLoading ? 'Creating Account...' : 'Create Account'}</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Login */}
          <View style={styles.socialRow}>
            <SocialButton icon={<GoogleIcon />} label="Google" onPress={() => handleProviderSignUp('google')} />
            <SocialButton icon={<AppleIcon />} label="Apple" onPress={() => handleProviderSignUp('apple')} />
          </View>

          {/* Sign In Link */}
          <View style={styles.linkRow}>
            <Text style={styles.linkText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/signin')}>
              <Text style={styles.linkAction}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
    </PremiumScreen>
  );
}

function InputField({ icon, placeholder, value, onChangeText, isFocused, onFocus, onBlur, secureTextEntry, showPasswordToggle, isPasswordVisible, onTogglePassword, keyboardType, autoCapitalize }: {
  icon: React.ReactNode; placeholder: string; value: string; onChangeText: (text: string) => void;
  isFocused: boolean; onFocus: () => void; onBlur: () => void;
  secureTextEntry?: boolean; showPasswordToggle?: boolean; isPasswordVisible?: boolean; onTogglePassword?: () => void;
  keyboardType?: 'default' | 'email-address'; autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
}) {
  return (
    <View style={[styles.inputContainer, isFocused && styles.inputFocused]}>
      <View style={styles.inputContent}>
        <View style={styles.inputIcon}>{icon}</View>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#ABA291"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        {showPasswordToggle && (
          <TouchableOpacity onPress={onTogglePassword} style={styles.eyeButton}>
            {isPasswordVisible ? <EyeOff size={18} color="#ABA291" /> : <Eye size={18} color="#ABA291" />}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SocialButton({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.socialButton} activeOpacity={0.8}>
      <View style={styles.socialIcon}>{icon}</View>
      <Text style={styles.socialLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgContainer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#221F18',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#40382A',
  },
  headerText: {
    flex: 1,
    marginLeft: 16,
  },
  title: {
    color: '#FAF6EE',
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#C7BFAF',
    fontSize: 14,
    marginTop: 4,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#40382A',
    backgroundColor: '#181611',
    overflow: 'hidden',
  },
  inputFocused: {
    borderColor: 'rgba(231,190,115,0.6)',
  },
  inputContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    color: '#FAF6EE',
    fontSize: 16,
  },
  eyeButton: {
    marginLeft: 8,
    padding: 4,
  },
  strengthContainer: {
    marginTop: 12,
  },
  strengthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  strengthLabel: {
    color: '#C7BFAF',
    fontSize: 12,
  },
  strengthValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 6,
  },
  strengthBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#40382A',
    overflow: 'hidden',
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  primaryButton: {
    marginTop: 32,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#E7BE73',
    shadowColor: '#E7BE73',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButtonDisabled: {
    backgroundColor: '#B88942',
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#171208',
    fontSize: 18,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#40382A',
  },
  dividerText: {
    color: '#ABA291',
    fontSize: 14,
    marginHorizontal: 16,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 16,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#40382A',
    backgroundColor: '#221F18',
  },
  socialIcon: {
    marginRight: 8,
  },
  socialLabel: {
    color: '#C7BFAF',
    fontSize: 16,
    fontWeight: '500',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  linkText: {
    color: '#C7BFAF',
    fontSize: 16,
  },
  linkAction: {
    color: '#E7BE73',
    fontSize: 16,
    fontWeight: '600',
  },
});
