import { Capacitor } from '@capacitor/core';

let initPromise: Promise<void> | null = null;

export async function initAppCheck(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const { FirebaseAppCheck } = await import('@capacitor-firebase/app-check');
      await FirebaseAppCheck.initialize({
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      console.warn('[appCheck] initialization failed', error);
    }
  })();

  return initPromise;
}
