export const motion = {
  // Durations in milliseconds
  fast: 150,
  base: 250,
  slow: 400,
  verySlow: 600,

  // Spring configs for Reanimated
  spring: {
    default: {
      damping: 15,
      stiffness: 150,
      mass: 1,
    },
    gentle: {
      damping: 20,
      stiffness: 100,
      mass: 1,
    },
    bouncy: {
      damping: 12,
      stiffness: 200,
      mass: 1,
    },
    stiff: {
      damping: 20,
      stiffness: 300,
      mass: 1,
    },
  },

  // Timing configs for Reanimated
  timing: {
    default: {
      duration: 250,
    },
    slow: {
      duration: 400,
    },
    fast: {
      duration: 150,
    },
  },
} as const;

export type Motion = typeof motion;
