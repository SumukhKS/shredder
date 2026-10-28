import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import { clearQueryCache } from '@/lib/use-query';
import type { Profile } from '@/types/db';

interface SessionState {
  session: Session | null;
  profile: Profile | null;
  ready: boolean;
  init: () => () => void;
  refreshProfile: () => Promise<Profile | null>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
}

// The last profile seen, kept on the device so the app opens without waiting for the network.
const PROFILE_KEY = 'shredder.profile';

function cachedProfile(userId: string): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Profile | null;
    return p?.id === userId ? p : null;
  } catch {
    return null;
  }
}

export const useSession = create<SessionState>((set, get) => ({
  session: null,
  profile: null,
  ready: false,

  init: () => {
    supabase.auth.getSession().then(async ({ data }) => {
      set({ session: data.session });
      const cached = data.session ? cachedProfile(data.session.user.id) : null;
      if (cached) {
        // Show the app straight away and bring the profile up to date behind it.
        set({ profile: cached, ready: true });
        get().refreshProfile();
        return;
      }
      if (data.session) await get().refreshProfile();
      set({ ready: true });
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const prev = get().session;
      set({ session });
      if (!session) {
        set({ profile: null });
        localStorage.removeItem(PROFILE_KEY);
        clearQueryCache();
      } else if (session.user.id !== prev?.user.id) {
        // Defer: Supabase recommends not awaiting other client calls inside this callback.
        setTimeout(() => get().refreshProfile(), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  },

  refreshProfile: async () => {
    const userId = get().session?.user.id;
    if (!userId) return null;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) return null;
    set({ profile: data as Profile });
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
    return data as Profile;
  },

  updateProfile: async (patch) => {
    const userId = get().session?.user.id;
    if (!userId) return;
    // XP and streak columns are server-owned; strip them defensively.
    const { total_xp, current_streak, longest_streak, last_active_day, id, ...writable } = patch;
    void total_xp;
    void current_streak;
    void longest_streak;
    void last_active_day;
    void id;
    const { data, error } = await supabase.from('profiles').update(writable).eq('id', userId).select('*').single();
    if (error) throw error;
    set({ profile: data as Profile });
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
    localStorage.removeItem(PROFILE_KEY);
    clearQueryCache();
  },
}));
