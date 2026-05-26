import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications, type Token } from '@capacitor/push-notifications';

const S1_NOTIFICATION_ID = 30101;
const S2_NOTIFICATION_ID = 30102;
const S3_NOTIFICATION_ID = 30103;
const S4_NOTIFICATION_ID = 30104;
const S5_NOTIFICATION_ID = 30105;
const CHANNEL_ID = 'once-triplex-alerts';
const NOTIFICATIONS_KEY = 'once_draw_notifications';
const PUSH_API_URL = 'https://pick3-results-proxy.onrender.com/push/register';

let pushListenersReady = false;
let pushRegistrationResolver: ((result: PushRegistrationResult) => void) | null = null;

export interface DrawNotificationResult {
  localEnabled: boolean;
  pushRegistered: boolean;
  pushServerReady: boolean;
}

interface PushRegistrationResult {
  registered: boolean;
  serverReady: boolean;
}

interface PushRegistrationResponse {
  ok?: boolean;
  pushConfigured?: boolean;
}

export async function enableDrawNotifications(): Promise<DrawNotificationResult> {
  const localEnabled = await scheduleDrawNotifications();
  const pushResult = await registerPushNotifications();

  return {
    localEnabled,
    pushRegistered: pushResult.registered,
    pushServerReady: pushResult.serverReady,
  };
}

export async function scheduleDrawNotifications(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  const current = await LocalNotifications.checkPermissions();
  const permission = current.display === 'granted'
    ? current
    : await LocalNotifications.requestPermissions();

  if (permission.display !== 'granted') {
    return false;
  }

  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Alertas Triplex ONCE',
    description: 'Avisos diarios para los sorteos del Triplex de la ONCE.',
    importance: 4,
    visibility: 1,
    vibration: true,
  });

  await LocalNotifications.cancel({
    notifications: [
      { id: S1_NOTIFICATION_ID },
      { id: S2_NOTIFICATION_ID },
      { id: S3_NOTIFICATION_ID },
      { id: S4_NOTIFICATION_ID },
      { id: S5_NOTIFICATION_ID },
    ],
  });

  await LocalNotifications.schedule({
    notifications: [
      {
        id: S1_NOTIFICATION_ID,
        title: 'Triplex S1 (10:00)',
        body: 'Sorteo 1 del Triplex ONCE. Abre la app para ver los resultados.',
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher_foreground',
        iconColor: '#22c55e',
        autoCancel: true,
        schedule: {
          on: { hour: 10, minute: 15 },
          repeats: true,
          allowWhileIdle: true,
        },
      },
      {
        id: S2_NOTIFICATION_ID,
        title: 'Triplex S2 (12:00)',
        body: 'Sorteo 2 del Triplex ONCE. Abre la app para ver los resultados.',
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher_foreground',
        iconColor: '#22c55e',
        autoCancel: true,
        schedule: {
          on: { hour: 12, minute: 15 },
          repeats: true,
          allowWhileIdle: true,
        },
      },
      {
        id: S3_NOTIFICATION_ID,
        title: 'Triplex S3 (14:00)',
        body: 'Sorteo 3 del Triplex ONCE. Abre la app para ver los resultados.',
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher_foreground',
        iconColor: '#22c55e',
        autoCancel: true,
        schedule: {
          on: { hour: 14, minute: 15 },
          repeats: true,
          allowWhileIdle: true,
        },
      },
      {
        id: S4_NOTIFICATION_ID,
        title: 'Triplex S4 (17:00)',
        body: 'Sorteo 4 del Triplex ONCE. Abre la app para ver los resultados.',
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher_foreground',
        iconColor: '#22c55e',
        autoCancel: true,
        schedule: {
          on: { hour: 17, minute: 15 },
          repeats: true,
          allowWhileIdle: true,
        },
      },
      {
        id: S5_NOTIFICATION_ID,
        title: 'Triplex S5 (21:15)',
        body: 'Sorteo 5 del Triplex ONCE. Abre la app para ver los resultados.',
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher_foreground',
        iconColor: '#22c55e',
        autoCancel: true,
        schedule: {
          on: { hour: 21, minute: 30 },
          repeats: true,
          allowWhileIdle: true,
        },
      },
    ],
  });

  localStorage.setItem(NOTIFICATIONS_KEY, 'enabled');
  return true;
}

export async function ensureDrawNotificationsIfEnabled(): Promise<void> {
  if (localStorage.getItem(NOTIFICATIONS_KEY) !== 'enabled') {
    return;
  }

  await scheduleDrawNotifications();
  await registerPushNotifications();
}

async function registerPushNotifications(): Promise<PushRegistrationResult> {
  if (!Capacitor.isNativePlatform()) {
    return { registered: false, serverReady: false };
  }

  await ensurePushListeners();

  const current = await PushNotifications.checkPermissions();
  const permission = current.receive === 'granted'
    ? current
    : await PushNotifications.requestPermissions();

  if (permission.receive !== 'granted') {
    return { registered: false, serverReady: false };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PushRegistrationResult) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      pushRegistrationResolver = null;
      resolve(result);
    };

    const timeout = window.setTimeout(() => {
      finish({ registered: false, serverReady: false });
    }, 8000);

    pushRegistrationResolver = finish;

    PushNotifications.register().catch(() => {
      finish({ registered: false, serverReady: false });
    });
  });
}

async function ensurePushListeners(): Promise<void> {
  if (pushListenersReady) {
    return;
  }

  pushListenersReady = true;

  await PushNotifications.addListener('registration', async (token: Token) => {
    const result = await registerPushToken(token.value);
    pushRegistrationResolver?.(result);
  });

  await PushNotifications.addListener('registrationError', () => {
    pushRegistrationResolver?.({ registered: false, serverReady: false });
  });
}

async function registerPushToken(token: string): Promise<PushRegistrationResult> {
  try {
    const response = await fetch(PUSH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        platform: Capacitor.getPlatform(),
      }),
    });

    if (!response.ok) {
      return { registered: false, serverReady: false };
    }

    const data = (await response.json()) as PushRegistrationResponse;
    return {
      registered: data.ok === true,
      serverReady: data.pushConfigured === true,
    };
  } catch {
    return { registered: false, serverReady: false };
  }
}
