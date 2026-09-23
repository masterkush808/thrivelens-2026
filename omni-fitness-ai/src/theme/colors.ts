/** Warm gold and obsidian, with distinct colors for status feedback. */
export const colors = {
  // Brand
  primary: "#E7BE73",
  primaryDark: "#B88942",
  primaryLight: "#F5DCA7",
  accent: "#F5DCA7",
  goldLight: "#F5DCA7",
  goldDeep: "#B88942",

  // Semantic
  success: "#34C759",
  warning: "#FF9500",
  error: "#FF3B30",
  info: "#5AC8FA",

  // Backgrounds
  background: "#0C0B09",
  surface: "#181611",
  surfaceElevated: "#221F18",
  surfaceHighlight: "#2D281E",

  // Text
  textPrimary: "#FAF6EE",
  textSecondary: "#C7BFAF",
  textTertiary: "#ABA291",
  textInverse: "#171208",

  // Borders
  border: "#40382A",
  borderLight: "#302B22",
  borderControl: "#80725A",

  // Overlays
  overlay: "rgba(0, 0, 0, 0.7)",
  overlayLight: "rgba(0, 0, 0, 0.35)",

  // Gradient stops
  gradientStart: "#F5DCA7",
  gradientEnd: "#B88942",

  // AI specific
  aiGlow: "#E7BE73",
  aiSurface: "rgba(231, 190, 115, 0.10)",
} as const;

export type Colors = typeof colors;
