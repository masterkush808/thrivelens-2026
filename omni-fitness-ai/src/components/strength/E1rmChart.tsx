import React from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { colors } from "@/theme/colors";
import type { StrengthPoint } from "@/data/workoutMetrics";

const WIDTH = 300;
const HEIGHT = 132;
const PAD = { top: 14, right: 10, bottom: 22, left: 10 };

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function E1rmChart({
  points,
  accent = colors.primary,
}: {
  points: StrengthPoint[];
  accent?: string;
}) {
  if (points.length === 0) return null;

  const values = points.map((point) => point.e1rm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawSpan = max - min;
  const breathing = rawSpan < 1 ? Math.max(1, max * 0.1) : rawSpan * 0.2;
  const low = min - breathing;
  const high = max + breathing;
  const range = high - low || 1;

  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;

  const xFor = (index: number) =>
    points.length === 1
      ? PAD.left + innerWidth / 2
      : PAD.left + (index / (points.length - 1)) * innerWidth;
  const yFor = (value: number) => PAD.top + innerHeight - ((value - low) / range) * innerHeight;

  const polyline = points.map((point, index) => `${xFor(index)},${yFor(point.e1rm)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Estimated one rep max chart with ${points.length} sessions, from ${Math.round(
        first.e1rm,
      )} to ${Math.round(last.e1rm)} kilograms`}
    >
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {[0, 0.5, 1].map((fraction) => {
          const y = PAD.top + innerHeight * fraction;
          return (
            <Line
              key={fraction}
              x1={PAD.left}
              y1={y}
              x2={WIDTH - PAD.right}
              y2={y}
              stroke={colors.borderLight}
              strokeWidth={1}
            />
          );
        })}

        <Polyline
          points={polyline}
          fill="none"
          stroke={accent}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((point, index) => (
          <Circle
            key={`${point.at}-${index}`}
            cx={xFor(index)}
            cy={yFor(point.e1rm)}
            r={index === points.length - 1 ? 4 : 2.5}
            fill={index === points.length - 1 ? accent : colors.surfaceElevated}
            stroke={accent}
            strokeWidth={1.5}
          />
        ))}

        <SvgText x={PAD.left} y={HEIGHT - 6} fill={colors.textTertiary} fontSize={9}>
          {shortDate(first.at)}
        </SvgText>
        <SvgText
          x={WIDTH - PAD.right}
          y={HEIGHT - 6}
          fill={colors.textTertiary}
          fontSize={9}
          textAnchor="end"
        >
          {shortDate(last.at)}
        </SvgText>
      </Svg>
    </View>
  );
}
