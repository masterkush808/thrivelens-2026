import React, { useCallback, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { GoldAtmosphere } from './GoldAtmosphere';
import { useMotionPreferences } from '@/hooks/useMotionPreferences';
import { colors } from '@/theme';

/** Focus animation preserves the screen instance, forms, scroll, and navigation state. */
export function PremiumScreen({ children }: { children: React.ReactNode }) {
  const { reduceMotion, isActive } = useMotionPreferences();
  const [progress] = useState(() => new Animated.Value(1));
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    progress.stopAnimation();
    if (reduceMotion || !isActive) progress.setValue(1);
    else {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1, duration: 340, easing: Easing.out(Easing.cubic),
        useNativeDriver: true, isInteraction: false,
      }).start();
    }
    return () => { progress.stopAnimation(); progress.setValue(1); setFocused(false); };
  }, [isActive, progress, reduceMotion]));
  return (
    <View style={styles.root}>
      <GoldAtmosphere active={focused} />
      <Animated.View style={[styles.foreground, {
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  foreground: { flex: 1 },
});
