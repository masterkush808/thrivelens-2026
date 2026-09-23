import React from "react";
import { View, ViewStyle, StyleProp } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../../theme";
import { Text } from "./Text";

const clampProgress = (progress: number) => Number.isFinite(progress) ? Math.max(0, Math.min(progress, 100)) : 0;

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  label?: string;
  value?: string;
  style?: StyleProp<ViewStyle>;
}

export function ProgressRing({
  progress, size = 80, strokeWidth = 6, color = colors.primary,
  backgroundColor = colors.surfaceHighlight, label, value, style,
}: ProgressRingProps) {
  const safeProgress = clampProgress(progress);
  const diameter = Math.max(1, size);
  const width = Math.max(1, Math.min(strokeWidth, diameter / 2));
  const radius = (diameter - width) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = diameter / 2;

  return (
    <View
      className="items-center"
      style={style}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: safeProgress, text: value ?? `${Math.round(safeProgress)}%` }}
    >
      <View style={{ width: diameter, height: diameter }}>
        <Svg width={diameter} height={diameter}>
          <Circle cx={center} cy={center} r={radius} stroke={backgroundColor} strokeWidth={width} fill="none" />
          {safeProgress > 0 && (
            <Circle
              cx={center} cy={center} r={radius} stroke={color} strokeWidth={width} fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - safeProgress / 100)}
              strokeLinecap="round"
              transform={`rotate(-90 ${center} ${center})`}
            />
          )}
        </Svg>
        <View className="absolute inset-0 items-center justify-center" style={{ padding: width + 3 }}>
          <Text variant={diameter < 100 ? "statSmall" : "stat"} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {value ?? `${Math.round(safeProgress)}%`}
          </Text>
        </View>
      </View>
      {label && <Text variant="caption" className="text-text-secondary mt-2 text-center">{label}</Text>}
    </View>
  );
}

interface ProgressBarProps {
  progress: number; // 0-100
  height?: number;
  color?: string;
  backgroundColor?: string;
  showLabel?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({
  progress, height = 6, color = colors.primary,
  backgroundColor = colors.surfaceHighlight, showLabel = false, label, style,
}: ProgressBarProps) {
  const safeProgress = clampProgress(progress);
  return (
    <View
      style={style}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: safeProgress }}
    >
      {showLabel && label && (
        <View className="flex-row justify-between mb-2">
          <Text variant="caption" className="text-text-secondary">{label}</Text>
          <Text variant="caption" className="text-primary tabular-nums">{Math.round(safeProgress)}%</Text>
        </View>
      )}
      <View className="rounded-full overflow-hidden" style={{ height: Math.max(1, height), backgroundColor }}>
        <View className="h-full rounded-full" style={{ width: `${safeProgress}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}

interface CircularProgressProps {
  value: number;
  maxValue: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function CircularProgress({ value, maxValue, color, size = 80, strokeWidth = 6, label }: CircularProgressProps) {
  const progress = maxValue > 0 ? clampProgress((value / maxValue) * 100) : 0;
  return <ProgressRing progress={progress} size={size} strokeWidth={strokeWidth} color={color} label={label} />;
}
