import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/** Start still until the device preference is known; update if it changes. */
export function useMotionPreferences() {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      preferenceChanged = true;
      if (mounted) setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted && !preferenceChanged) setReduceMotion(value);
    }).catch(() => undefined);
    const state = AppState.addEventListener('change', (value) => setIsActive(value === 'active'));
    return () => { mounted = false; motion.remove(); state.remove(); };
  }, []);
  return { reduceMotion, isActive };
}
