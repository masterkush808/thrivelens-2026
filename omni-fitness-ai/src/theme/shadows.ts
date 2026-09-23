import { ViewStyle } from "react-native";
import { colors } from "./colors";

/** Soft depth keeps gold details crisp against the warm, dark surfaces. */
export const shadows = {
  none: {} as ViewStyle,
  sm: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 2,
  } as ViewStyle,
  md: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  } as ViewStyle,
  lg: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 20,
    elevation: 7,
  } as ViewStyle,
  xl: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 10,
  } as ViewStyle,
  aiGlow: {
    shadowColor: colors.aiGlow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  } as ViewStyle,
  primaryGlow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
  } as ViewStyle,
} as const;

export type Shadows = typeof shadows;
