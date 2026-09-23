import React, { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useMotionPreferences } from '@/hooks/useMotionPreferences';
import { colors } from '@/theme';

const logo = require('../../../assets/images/297b11a4-1998-4a78-8749-65a9fd0d3ba0.png');

/** Decorative only: never captures taps, focus, or screen-reader attention. */
export function GoldAtmosphere({ active = true }: { active?: boolean }) {
  const { reduceMotion, isActive } = useMotionPreferences();
  const [drift] = useState(() => new Animated.Value(0));
  useEffect(() => {
    drift.stopAnimation();
    if (reduceMotion || !isActive || !active) { drift.setValue(0); return; }
    // One gentle settling movement, then still: no permanent GPU animation loop.
    const animation = Animated.timing(drift, {
      toValue: 1, duration: 14000, easing: Easing.inOut(Easing.sin),
      useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [active, drift, isActive, reduceMotion]);

  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" style={styles.layer}>
      <Animated.View style={[styles.halo, {
        opacity: drift.interpolate({ inputRange: [0, 1], outputRange: [0.10, 0.15] }),
        transform: [
          { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] }) },
          { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-12, 10] }) },
          { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '2deg'] }) },
        ],
      }]}>
        <Image source={logo} resizeMode="contain" blurRadius={28} style={styles.image} />
      </Animated.View>
      <LinearGradient colors={['rgba(12,11,9,0.12)', 'rgba(12,11,9,0.70)', 'rgba(12,11,9,0.94)']}
        locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(231,190,115,0.025)', 'transparent', 'rgba(184,137,66,0.02)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background, overflow: 'hidden' },
  halo: { position: 'absolute', width: 620, height: 620, top: -170, right: -205 },
  image: { width: '100%', height: '100%' },
});
