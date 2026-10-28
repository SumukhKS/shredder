import 'expo-sqlite/localStorage/install';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AppSettings {
  /** Download new versions by themselves and install them on the next launch. Off: ask first. */
  autoUpdate: boolean;
  setAutoUpdate: (on: boolean) => void;
}

/** App preferences kept on this device. */
export const useAppSettings = create<AppSettings>()(
  persist(
    (set) => ({
      autoUpdate: false,
      setAutoUpdate: (autoUpdate) => set({ autoUpdate }),
    }),
    { name: 'shredder-app-settings', storage: createJSONStorage(() => localStorage) }
  )
);
