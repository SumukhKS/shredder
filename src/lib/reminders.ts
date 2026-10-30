import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import type { Reminder, ReminderKind } from '@/stores/app-settings';

const CHANNEL = 'reminders';

export const REMINDER_TEXT: Record<ReminderKind, { label: string; detail: string; title: string; body: string }> = {
  workout: {
    label: 'Workout',
    detail: 'A nudge to train today',
    title: 'Time to train',
    body: 'Time to train. Start a workout in Shredder.',
  },
  food: {
    label: 'Food log',
    detail: 'Log what you ate before the day ends',
    title: 'Log your food',
    body: "Add today's meals so your calories and macros are right.",
  },
  water: {
    label: 'Water',
    detail: 'Keep up with your water goal',
    title: 'Drink some water',
    body: 'Log a glass and stay on track for your water goal.',
  },
  weighIn: {
    label: 'Weigh-in',
    detail: 'Morning weigh-in for steady trends',
    title: 'Weigh in',
    body: 'Step on the scale and log it before breakfast.',
  },
};

// Shown even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Ask for permission to show notifications. True when allowed. */
export async function allowReminders(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Reminders',
      importance: AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Replace every scheduled reminder with the ones that are switched on. */
export async function scheduleReminders(reminders: Record<ReminderKind, Reminder>) {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const on = (Object.keys(reminders) as ReminderKind[]).filter((k) => reminders[k].on);
  if (!on.length || !(await Notifications.getPermissionsAsync()).granted) return;
  for (const kind of on) {
    const { hour, minute } = reminders[kind];
    await Notifications.scheduleNotificationAsync({
      identifier: `reminder-${kind}`,
      content: { title: REMINDER_TEXT[kind].title, body: REMINDER_TEXT[kind].body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL },
    });
  }
}

/** 7:30 PM style. */
export function formatTime(hour: number, minute: number) {
  const h = hour % 12 || 12;
  return `${h}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}
