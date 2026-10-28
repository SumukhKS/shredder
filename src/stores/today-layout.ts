import 'expo-sqlite/localStorage/install';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type CardId = 'streak' | 'calories' | 'water' | 'steps' | 'sleep' | 'workout';
/** large: full width with detail. medium: full width, one compact row. small: half-width tile. */
export type CardSize = 'large' | 'medium' | 'small';

export interface CardPref {
  id: CardId;
  visible: boolean;
  size: CardSize;
}

export const CARD_NAMES: Record<CardId, string> = {
  streak: 'Streaks',
  calories: 'Calories and macros',
  water: 'Water',
  steps: 'Steps',
  sleep: 'Sleep',
  workout: 'Workout',
};

/** Bottom-bar tabs that can be hidden. Today always stays, since the layout is edited there. */
export type TabId = 'train' | 'fuel' | 'profile';
export const TAB_NAMES: Record<TabId, string> = { train: 'Train', fuel: 'Fuel', profile: 'Profile' };

const DEFAULT: CardPref[] = [
  { id: 'streak', visible: true, size: 'large' },
  { id: 'calories', visible: true, size: 'large' },
  { id: 'workout', visible: true, size: 'large' },
  { id: 'water', visible: true, size: 'medium' },
  { id: 'steps', visible: true, size: 'small' },
  { id: 'sleep', visible: true, size: 'small' },
];

interface LayoutState {
  cards: CardPref[];
  hiddenTabs: TabId[];
  toggleTab: (id: TabId) => void;
  toggle: (id: CardId) => void;
  setSize: (id: CardId, size: CardSize) => void;
  /** New order for the given cards (e.g. the visible ones after a drag); others keep their place after them. */
  setOrder: (ids: CardId[]) => void;
  reset: () => void;
}

/** Which cards the Today tab shows, in what order and at what size. Saved on this device. */
export const useTodayLayout = create<LayoutState>()(
  persist(
    (set) => ({
      cards: DEFAULT,
      hiddenTabs: [],
      toggleTab: (id) =>
        set((s) => ({ hiddenTabs: s.hiddenTabs.includes(id) ? s.hiddenTabs.filter((t) => t !== id) : [...s.hiddenTabs, id] })),
      toggle: (id) => set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)) })),
      setSize: (id, size) => set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, size } : c)) })),
      setOrder: (ids) =>
        set((s) => ({
          cards: [
            ...ids.map((id) => s.cards.find((c) => c.id === id)).filter((c): c is CardPref => !!c),
            ...s.cards.filter((c) => !ids.includes(c.id)),
          ],
        })),
      reset: () => set({ cards: DEFAULT, hiddenTabs: [] }),
    }),
    {
      name: 'shredder-today-layout',
      storage: createJSONStorage(() => localStorage),
      // Cards added in later versions join the end of a saved layout.
      merge: (saved, current) => {
        const old = saved as Partial<LayoutState> | undefined;
        const cards = (old?.cards ?? []).filter((c) => c.id in CARD_NAMES);
        const missing = DEFAULT.filter((d) => !cards.some((c) => c.id === d.id));
        // Progress became Profile.
        const hiddenTabs = (old?.hiddenTabs ?? [])
          .map((t) => ((t as string) === 'progress' ? 'profile' : t))
          .filter((t) => t in TAB_NAMES);
        return { ...current, cards: cards.length ? [...cards, ...missing] : DEFAULT, hiddenTabs };
      },
    }
  )
);
