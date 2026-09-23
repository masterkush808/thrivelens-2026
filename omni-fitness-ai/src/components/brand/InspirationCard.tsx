import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowRight, Sparkles } from 'lucide-react-native';
import { CATEGORY_LABELS } from '../../data/motivations';
import { useMotionPreferences } from '@/hooks/useMotionPreferences';
import { useInspiration } from '../../providers/InspirationProvider';

type InspirationCardProps = {
  compact?: boolean;
  showNext?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The same session selection is shared with the launch welcome moment. */
export function InspirationCard({ compact = false, showNext = true, style }: InspirationCardProps) {
  const { message, nextMessage, ready } = useInspiration();
  const { reduceMotion, isActive } = useMotionPreferences();
  const [reveal] = useState(() => new Animated.Value(1));
  useEffect(() => {
    reveal.stopAnimation();
    if (reduceMotion || !isActive) { reveal.setValue(1); return; }
    reveal.setValue(0.25);
    const animation = Animated.timing(reveal, { toValue: 1, duration: 280,
      easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [message.id, ready, reduceMotion, isActive, reveal]);

  return (
    <View style={[styles.card, compact && styles.compactCard, style]}>
      <View style={styles.eyebrowRow}>
        <Sparkles size={15} color="#E7BE73" strokeWidth={1.5} accessible={false} />
        <Text style={styles.eyebrow}>A MOMENT FOR YOU</Text>
      </View>
      <Animated.View style={{ opacity: reveal }}>
      <Text style={[styles.title, compact && styles.compactTitle]} accessibilityRole="header">
        {ready ? message.title : 'A little inspiration'}
      </Text>
      <Text style={[styles.message, compact && styles.compactMessage]}>
        {ready ? message.message : 'Making space for your next small step…'}
      </Text>
      </Animated.View>
      <View style={styles.footer}>
        <Text style={styles.category}>{ready ? CATEGORY_LABELS[message.category] : 'Your daily perspective'}</Text>
        {showNext && (
          <Pressable
            onPress={nextMessage}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityLabel="Next inspiration"
            accessibilityHint="Shows another encouraging thought in this card."
            accessibilityState={{ disabled: !ready }}
            style={({ pressed }) => [styles.nextButton, pressed && styles.nextPressed, !ready && styles.disabled]}
          >
            <Text style={styles.nextText}>Another thought</Text>
            <ArrowRight size={15} color="#E7BE73" accessible={false} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#181611',
    borderWidth: 1,
    borderColor: '#40382A',
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
  },
  compactCard: { padding: 20 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  eyebrow: { color: '#E7BE73', fontSize: 10, fontWeight: '700', letterSpacing: 2.1, flexShrink: 1 },
  title: {
    color: '#FAF6EE',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }),
    fontSize: 29,
    lineHeight: 36,
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  compactTitle: { fontSize: 25, lineHeight: 32 },
  message: { color: '#C7BFAF', fontSize: 16, lineHeight: 25 },
  compactMessage: { fontSize: 15, lineHeight: 23 },
  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4, marginTop: 16 },
  category: { color: '#C7BFAF', fontSize: 12, lineHeight: 18, marginRight: 8 },
  nextButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  nextPressed: { backgroundColor: 'rgba(231, 190, 115, 0.10)' },
  nextText: { color: '#E7BE73', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  disabled: { opacity: 0.5 },
});
