/**
 * Local notifications for the rest timer. Configured lazily: the handler and Android channel are
 * set up, and permission requested, the first time a rest timer starts.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

const REST_CHANNEL_ID = 'rest-timer';

let configured: Promise<boolean> | null = null;

async function configure(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    // The channel must exist before requesting permission on Android 13+.
    await Notifications.setNotificationChannelAsync(REST_CHANNEL_ID, {
      name: 'Rest timer',
      description: 'Tells you when your rest between sets is over',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      enableVibrate: true,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return requested.granted;
}

/** Sets up notifications once; resolves to whether we may post them. Never throws. */
export function ensureNotificationsReady(): Promise<boolean> {
  if (!configured) {
    configured = configure().catch(() => {
      configured = null;
      return false;
    });
  }
  return configured;
}

/** Schedules the "Rest complete" notification. Returns its id, or null if not possible. */
export async function scheduleRestNotification(seconds: number): Promise<string | null> {
  if (seconds < 1) return null;
  const ok = await ensureNotificationsReady();
  if (!ok) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: 'Rest complete', body: 'Time for your next set.', sound: 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(seconds)),
        channelId: REST_CHANNEL_ID,
      },
    });
  } catch {
    return null;
  }
}

export async function cancelRestNotification(id: string | null | undefined): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // already fired or never existed
  }
}
