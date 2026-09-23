import { TextStyle } from "react-native";
import { colors } from "./colors";

/** Native system typography: clean hierarchy without a font-loading dependency. */
export const typography = {
  display: { fontSize: 40, lineHeight: 46, fontWeight: "600", letterSpacing: -1.3, color: colors.textPrimary } as TextStyle,
  h1: { fontSize: 32, lineHeight: 39, fontWeight: "600", letterSpacing: -0.8, color: colors.textPrimary } as TextStyle,
  h2: { fontSize: 24, lineHeight: 31, fontWeight: "600", letterSpacing: -0.4, color: colors.textPrimary } as TextStyle,
  h3: { fontSize: 20, lineHeight: 27, fontWeight: "600", letterSpacing: -0.2, color: colors.textPrimary } as TextStyle,
  bodyLarge: { fontSize: 18, lineHeight: 27, fontWeight: "400", color: colors.textPrimary } as TextStyle,
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400", color: colors.textPrimary } as TextStyle,
  bodySmall: { fontSize: 14, lineHeight: 21, fontWeight: "400", color: colors.textSecondary } as TextStyle,
  caption: { fontSize: 12, lineHeight: 17, fontWeight: "500", letterSpacing: 0.2, color: colors.textTertiary } as TextStyle,
  button: { fontSize: 16, lineHeight: 22, fontWeight: "600", letterSpacing: 0.2, color: colors.textPrimary } as TextStyle,
  stat: { fontSize: 28, lineHeight: 34, fontWeight: "600", letterSpacing: -0.8, fontVariant: ["tabular-nums"], color: colors.textPrimary } as TextStyle,
  statSmall: { fontSize: 20, lineHeight: 26, fontWeight: "600", letterSpacing: -0.3, fontVariant: ["tabular-nums"], color: colors.textPrimary } as TextStyle,
  statLarge: { fontSize: 48, lineHeight: 55, fontWeight: "600", letterSpacing: -1.5, fontVariant: ["tabular-nums"], color: colors.textPrimary } as TextStyle,
} as const;

export type Typography = typeof typography;
