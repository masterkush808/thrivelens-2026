import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Registers the web service worker that makes Thrive Lens installable and
 * usable offline. No-op on native, where the bundle is already on device.
 */
export function useServiceWorker() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // Registering on load keeps first paint fast on a cold visit.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline support is an enhancement; the app still works without it.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);
}
