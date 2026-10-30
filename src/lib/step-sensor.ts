import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

import { allowReminders } from '@/lib/reminders';

interface StepCounterModule {
  isSupported(): boolean;
  isEnabled(): boolean;
  readAll(): string;
  start(): void;
  stop(): void;
  shareImage(uri: string, text: string, title: string): void;
}

/** Our local module (`modules/step-counter`). Missing on iOS and on the web. */
const native = requireOptionalNativeModule<StepCounterModule>('StepCounter');

export const stepSensorSupported = () => native?.isSupported() ?? false;
export const stepSensorOn = () => native?.isEnabled() ?? false;

/** Asks for what it needs, then starts counting with the live notification. Returns why it couldn't, or null. */
export async function startStepSensor(): Promise<string | null> {
  if (!native || !native.isSupported()) return "This phone doesn't have a step sensor.";
  if (Platform.OS === 'android') {
    const physical = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
    if (physical !== PermissionsAndroid.RESULTS.GRANTED) return 'Allow physical activity for Shredder to count steps.';
  }
  // Without this the counting still runs, but Android hides the notification.
  await allowReminders().catch(() => false);
  native.start();
  return null;
}

/** After a restart or update: picks counting back up without asking for anything again. */
export async function resumeStepSensor() {
  if (!native?.isSupported()) return;
  if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION)) native.start();
}

export const stopStepSensor = () => native?.stop();

function days(): Record<string, number[]> {
  try {
    return native ? (JSON.parse(native.readAll()) as Record<string, number[]>) : {};
  } catch {
    return {};
  }
}

/** Steps on each day counted so far. */
export function sensorStepsByDay(): Record<string, number> {
  return Object.fromEntries(Object.entries(days()).map(([day, hours]) => [day, hours.reduce((a, b) => a + b, 0)]));
}

export function sensorStepsByHour(day: string): number[] {
  return days()[day] ?? new Array<number>(24).fill(0);
}

/** Picture and message in the one share sheet. False when this build can't, so the caller can fall back. */
export function shareImageWithText(uri: string, text: string, title: string): boolean {
  if (!native) return false;
  native.shareImage(uri, text, title);
  return true;
}
