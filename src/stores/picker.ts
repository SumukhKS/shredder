import { create } from 'zustand';

import type { Exercise } from '@/types/db';

/** Hands exercises picked in the modal back to the routine editor. */
export const usePicker = create<{ picked: Exercise[] | null; set: (e: Exercise[]) => void; take: () => Exercise[] | null }>(
  (set, get) => ({
    picked: null,
    set: (e) => set({ picked: e }),
    take: () => {
      const p = get().picked;
      set({ picked: null });
      return p;
    },
  })
);
