import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useInspiration } from '@/providers/InspirationProvider';
import { useMotionPreferences } from '@/hooks/useMotionPreferences';
import { GoldAtmosphere } from './GoldAtmosphere';
import { colors } from '@/theme';

/** Deferred until Home so returning to a workout or camera is never interrupted. */
export function LaunchInspiration({ eligible }: { eligible: boolean }) {
  const { message, ready, launchRevision } = useInspiration();
  const { reduceMotion } = useMotionPreferences();
  const [dismissedRevision, setDismissedRevision] = useState(0);
  const insets = useSafeAreaInsets();
  const visible = eligible && ready && launchRevision > dismissedRevision;
  const dismiss = () => setDismissedRevision(launchRevision);
  return (
    <Modal visible={visible} animationType={reduceMotion ? 'none' : 'fade'} transparent={false}
      onRequestClose={dismiss} statusBarTranslucent presentationStyle="fullScreen">
      <View style={styles.root} accessibilityViewIsModal>
        <GoldAtmosphere active={visible} />
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 30, paddingBottom: insets.bottom + 28 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close inspiration and enter Thrive Lens"
            onPress={dismiss} style={styles.close}><X size={22} color={colors.textSecondary} /></Pressable>
          <Image source={require('../../../assets/images/297b11a4-1998-4a78-8749-65a9fd0d3ba0.png')}
            resizeMode="contain" style={styles.logo} accessibilityLabel="Thrive Lens, gold orbit logo" />
          <Text style={styles.eyebrow}>A MOMENT FOR YOU</Text>
          <Text accessibilityRole="header" style={styles.title}>{message.title}</Text>
          <Text style={styles.message}>{message.message}</Text>
          <View style={styles.rule} />
          <Text style={styles.note}>Your pace. Your progress. Your next step.</Text>
          <Pressable accessibilityRole="button" onPress={dismiss} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.82 }]}>
            <LinearGradient colors={['#F5DCA7', '#E7BE73', '#C9984E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ctaFill}>
              <Text style={styles.ctaText}>Step into today</Text><ArrowRight size={20} color={colors.textInverse} />
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, width: '100%', maxWidth: 600, alignSelf: 'center' },
  close: { alignSelf: 'flex-end', minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  logo: { width: '100%', maxWidth: 260, height: 230, marginBottom: 24 },
  eyebrow: { color: colors.primary, fontSize: 11, lineHeight: 18, letterSpacing: 2.3, fontWeight: '600', textAlign: 'center', marginBottom: 18 },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', marginBottom: 16 },
  message: { color: colors.textSecondary, fontSize: 18, lineHeight: 29, textAlign: 'center' },
  rule: { backgroundColor: colors.primaryDark, height: 1, width: 44, marginTop: 28, marginBottom: 20 },
  note: { color: colors.textTertiary, textAlign: 'center', fontSize: 13, lineHeight: 20, marginBottom: 28 },
  cta: { width: '100%', borderRadius: 20, overflow: 'hidden' },
  ctaFill: { minHeight: 58, padding: 17, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.textInverse, fontSize: 16, lineHeight: 24, fontWeight: '700' },
});
