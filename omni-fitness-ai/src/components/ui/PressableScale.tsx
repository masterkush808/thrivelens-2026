import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, PressableProps, ViewStyle, StyleProp } from "react-native";

interface PressableScaleProps extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  pressRetentionOffset?: number;
}

export function PressableScale({
  children, style, hitSlop = 12, pressRetentionOffset = 16,
  onPressIn, onPressOut, disabled, ...rest
}: PressableScaleProps) {
  const [scale] = useState(() => new Animated.Value(1));
  // Stay still until the operating system preference has been read.
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let mounted = true;
    let receivedChange = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      receivedChange = true;
      if (mounted) setReduceMotion(enabled);
    });
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && !receivedChange) setReduceMotion(enabled);
    }).catch(() => { /* Keep motion disabled when the preference is unavailable. */ });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion || disabled) {
      scale.stopAnimation();
      scale.setValue(1);
    }
    return () => scale.stopAnimation();
  }, [reduceMotion, disabled, scale]);

  const animateTo = (value: number) => {
    scale.stopAnimation();
    if (reduceMotion || disabled) {
      scale.setValue(1);
      return;
    }
    Animated.timing(scale, { toValue: value, duration: value === 1 ? 180 : 120, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      accessibilityRole={rest.accessibilityRole ?? "button"}
      hitSlop={hitSlop}
      pressRetentionOffset={pressRetentionOffset}
      onPressIn={(event) => { animateTo(0.985); onPressIn?.(event); }}
      onPressOut={(event) => { animateTo(1); onPressOut?.(event); }}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}
