import { create } from 'zustand';

import type { Exercise } from '@/types/db';

/** Hands exercises picked in the modal back to the routine editor. */
export const usePicker = create<{
  picked: Exercise[] | null;
  set: (e: Exercise[]) => void;
  take: () => Exercise[] | null;
  /** An exercise just made in the Create exercise form, for the picker that opened it. */
  created: Exercise | null;
  setCreated: (e: Exercise | null) => void;
}>((set, get) => ({
  picked: null,
  created: null,
  setCreated: (e) => set({ created: e }),
  set: (e) => set({ picked: e }),
  take: () => {
    const p = get().picked;
    set({ picked: null });
    return p;
  },
}));
