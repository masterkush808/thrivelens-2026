import React from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRight, Dumbbell, Leaf, ScanLine, type LucideIcon } from 'lucide-react-native';
import { PremiumScreen } from '@/components/brand/PremiumScreen';
import { InspirationCard } from '@/components/brand/InspirationCard';

const ORIGINAL_LOGO = require('../../assets/images/297b11a4-1998-4a78-8749-65a9fd0d3ba0.png');

export default function Welcome() {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 860 && fontScale < 1.5;
  const heroSize = wide ? 66 : width < 360 ? 37 : 44;

  return (
    <PremiumScreen>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, wide && styles.wideScrollContent]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.page}>
            <View style={styles.header}>
              <View style={styles.brandLockup}>
                <Image source={ORIGINAL_LOGO} style={styles.logo} resizeMode="contain" accessibilityLabel="Thrive Lens" />
                <View style={styles.wordmark} accessible={false} importantForAccessibility="no-hide-descendants">
                  <Text style={styles.brandName}>THRIVE LENS</Text>
                  <Text style={styles.brandDescriptor}>AI-POWERED WELLNESS</Text>
                </View>
              </View>
              {wide && <Text style={styles.headerNote}>YOUR PACE. YOUR POSSIBILITY.</Text>}
            </View>

            <View style={[styles.body, wide && styles.wideBody]}>
              <View style={[styles.hero, wide && styles.wideHero]}>
                <View style={styles.kickerRow}>
                  <View style={styles.kickerLine} />
                  <Text style={styles.kicker}>BEGIN WITH YOU</Text>
                </View>
                <Text style={[styles.heroTitle, { fontSize: heroSize, lineHeight: heroSize * 1.12 }]} accessibilityRole="header">
                  A stronger you.{'\n'}
                  <Text style={styles.heroGold}>A fuller life.</Text>
                </Text>
                <Text style={styles.heroDescription}>
                  Intelligent fitness and food insights, with room for your goals, your rhythm, and your life.
                </Text>

                {!wide && <InspirationCard compact style={{ marginTop: 26 }} />}
                {wide && <Pillars />}

                <View style={styles.actions}>
                  <Pressable
                    onPress={() => router.push('/signup')}
                    accessibilityRole="button"
                    accessibilityLabel="Get started, create your account"
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
                  >
                    <Text style={styles.primaryButtonText}>Begin your journey</Text>
                    <ArrowRight size={20} strokeWidth={1.8} color="#171208" accessible={false} />
                  </Pressable>
                  <View style={styles.signInRow}>
                    <Text style={styles.signInPrompt}>Already part of Thrive Lens?</Text>
                    <Pressable
                      onPress={() => router.push('/signin')}
                      accessibilityRole="button"
                      accessibilityLabel="Sign in to your account"
                      style={({ pressed }) => [styles.signInButton, pressed && styles.signInPressed]}
                    >
                      <Text style={styles.signInText}>Sign in</Text>
                    </Pressable>
                  </View>
                </View>
                {!wide && <Pillars />}
              </View>

              {wide && <View style={[styles.inspirationColumn, wide && styles.wideInspirationColumn]}>
                <View style={styles.inspirationIntro}>
                  <Text style={styles.chapterNumber} accessible={false}>01 /</Text>
                  <Text style={styles.chapterText}>A fresh perspective.{'\n'}A step that is yours.</Text>
                </View>
                <InspirationCard />
                <View style={styles.closingNote}>
                  <View style={styles.closingLine} />
                  <Text style={styles.closingText}>Small steps. A life well lived.</Text>
                </View>
              </View>}
            </View>
            <Text style={styles.footer}>MOVE. NOURISH. THRIVE.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}

function Pillars() {
  return (
    <View style={styles.pillars}>
      <Pillar icon={Dumbbell} title="Move with purpose" description="Workouts for your next step." />
      <Pillar icon={ScanLine} title="Nourish with confidence" description="Food insights for everyday choices." />
      <Pillar icon={Leaf} title="Grow at your pace" description="A little perspective along the way." />
    </View>
  );
}

function Pillar({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <View style={styles.pillar}>
      <View style={styles.pillarIcon}>
        <Icon size={20} color="#E7BE73" strokeWidth={1.4} accessible={false} />
      </View>
      <View style={styles.pillarCopy}>
        <Text style={styles.pillarTitle}>{title}</Text>
        <Text style={styles.pillarDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 26 },
  wideScrollContent: { paddingHorizontal: 52, paddingTop: 30, paddingBottom: 30, justifyContent: 'center' },
  page: { width: '100%', maxWidth: 1120, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20, paddingBottom: 25, borderBottomWidth: 1, borderBottomColor: '#40382A' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 13, flexShrink: 1 },
  logo: { width: 88, height: 88, flexShrink: 0 },
  wordmark: { flexShrink: 1 },
  brandName: { color: '#E7BE73', fontSize: 18, fontWeight: '600', letterSpacing: 2.6 },
  brandDescriptor: { color: '#C7BFAF', fontSize: 9, fontWeight: '600', letterSpacing: 1.9, marginTop: 6 },
  headerNote: { color: '#C7BFAF', fontSize: 10, letterSpacing: 1.7, textAlign: 'right', flexShrink: 1 },
  body: { paddingTop: 39 },
  wideBody: { flexDirection: 'row', alignItems: 'center', gap: 65, paddingTop: 58, paddingBottom: 34 },
  hero: { width: '100%' },
  wideHero: { flex: 1.2, width: undefined },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 17 },
  kickerLine: { width: 27, height: 1, backgroundColor: '#E7BE73' },
  kicker: { color: '#E7BE73', fontSize: 10, letterSpacing: 2.3, fontWeight: '600', flexShrink: 1 },
  heroTitle: { color: '#FAF6EE', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }), letterSpacing: -1.9 },
  heroGold: { color: '#E7BE73', fontStyle: 'italic' },
  heroDescription: { color: '#C7BFAF', fontSize: 16, lineHeight: 26, marginTop: 21, maxWidth: 420 },
  pillars: { marginTop: 28, gap: 19 },
  pillar: { flexDirection: 'row', gap: 13, alignItems: 'center' },
  pillarIcon: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: '#40382A', backgroundColor: '#181611', alignItems: 'center', justifyContent: 'center' },
  pillarCopy: { flex: 1 },
  pillarTitle: { color: '#FAF6EE', fontSize: 14, fontWeight: '600', lineHeight: 21 },
  pillarDescription: { color: '#C7BFAF', fontSize: 12, lineHeight: 19, marginTop: 2 },
  actions: { marginTop: 32, maxWidth: 460 },
  primaryButton: { minHeight: 58, borderRadius: 16, backgroundColor: '#E7BE73', paddingVertical: 17, paddingHorizontal: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderWidth: 1, borderColor: '#F1D39C' },
  primaryPressed: { backgroundColor: '#F1D39C' },
  primaryButtonText: { color: '#171208', fontSize: 16, lineHeight: 23, fontWeight: '700', flexShrink: 1 },
  signInRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 3, marginTop: 9 },
  signInPrompt: { color: '#C7BFAF', fontSize: 12, lineHeight: 20 },
  signInButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 9, paddingVertical: 10, borderRadius: 9 },
  signInPressed: { backgroundColor: 'rgba(231, 190, 115, 0.1)' },
  signInText: { color: '#E7BE73', fontSize: 13, fontWeight: '700' },
  inspirationColumn: { marginTop: 36 },
  wideInspirationColumn: { flex: 1, marginTop: 0, maxWidth: 410 },
  inspirationIntro: { flexDirection: 'row', alignItems: 'flex-start', gap: 17, marginBottom: 23 },
  chapterNumber: { color: '#E7BE73', fontSize: 12, fontWeight: '600', letterSpacing: 2, marginTop: 4 },
  chapterText: { color: '#C7BFAF', fontSize: 15, lineHeight: 24, flexShrink: 1 },
  closingNote: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 22 },
  closingLine: { height: 1, width: 28, backgroundColor: '#40382A' },
  closingText: { color: '#C7BFAF', fontSize: 11, lineHeight: 17, letterSpacing: 0.5, flexShrink: 1 },
  footer: { color: '#C7BFAF', fontSize: 9, lineHeight: 16, letterSpacing: 2.2, marginTop: 39, textAlign: 'center' },
});
