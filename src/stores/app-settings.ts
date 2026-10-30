import 'expo-sqlite/localStorage/install';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ReminderKind = 'workout' | 'food' | 'water' | 'weighIn';
export interface Reminder {
  on: boolean;
  hour: number;
  minute: number;
}

interface AppSettings {
  /** Download new versions by themselves and install them on the next launch. Off: ask first. */
  autoUpdate: boolean;
  setAutoUpdate: (on: boolean) => void;
  /** How weights (lifts, body weight, volume) and lengths (height, measurements) are shown and typed. */
  weightUnit: 'kg' | 'lb';
  lengthUnit: 'cm' | 'in';
  setUnits: (patch: { weightUnit?: 'kg' | 'lb'; lengthUnit?: 'cm' | 'in' }) => void;
  /** Where steps come from. The two are never added together. Sleep always comes from Health Connect. */
  stepsSource: 'health_connect' | 'phone_sensor';
  setStepsSource: (source: 'health_connect' | 'phone_sensor') => void;
  /** Daily reminders, scheduled on this device (see `src/lib/reminders.ts`). */
  reminders: Record<ReminderKind, Reminder>;
  setReminder: (kind: ReminderKind, patch: Partial<Reminder>) => void;
}

/** App preferences kept on this device. */
export const useAppSettings = create<AppSettings>()(
  persist(
    (set) => ({
      autoUpdate: false,
      setAutoUpdate: (autoUpdate) => set({ autoUpdate }),
      weightUnit: 'kg',
      lengthUnit: 'cm',
      setUnits: (patch) => set(patch),
      stepsSource: 'health_connect',
      setStepsSource: (stepsSource) => set({ stepsSource }),
      reminders: {
        workout: { on: false, hour: 18, minute: 0 },
        food: { on: false, hour: 20, minute: 30 },
        water: { on: false, hour: 14, minute: 0 },
        weighIn: { on: false, hour: 7, minute: 30 },
      },
      setReminder: (kind, patch) => set((s) => ({ reminders: { ...s.reminders, [kind]: { ...s.reminders[kind], ...patch } } })),
    }),
    { name: 'shredder-app-settings', storage: createJSONStorage(() => localStorage) }
  )
);
