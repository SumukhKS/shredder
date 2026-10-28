import 'expo-sqlite/localStorage/install';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AppSettings {
  /** Download new versions by themselves and install them on the next launch. Off: ask first. */
  autoUpdate: boolean;
  setAutoUpdate: (on: boolean) => void;
  /** How weights (lifts, body weight, volume) and lengths (height, measurements) are shown and typed. */
  weightUnit: 'kg' | 'lb';
  lengthUnit: 'cm' | 'in';
  setUnits: (patch: { weightUnit?: 'kg' | 'lb'; lengthUnit?: 'cm' | 'in' }) => void;
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
    }),
    { name: 'shredder-app-settings', storage: createJSONStorage(() => localStorage) }
  )
);
