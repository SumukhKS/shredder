import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
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

export const useSession = create<SessionState>((set, get) => ({
  session: null,
  profile: null,
  ready: false,

  init: () => {
    supabase.auth.getSession().then(async ({ data }) => {
      set({ session: data.session });
      if (data.session) await get().refreshProfile();
      set({ ready: true });
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const prev = get().session;
      set({ session });
      if (!session) set({ profile: null });
      else if (session.user.id !== prev?.user.id) {
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
    return data as Profile;
  },

  updateProfile: async (patch) => {
    const userId = get().session?.user.id;
    if (!userId) return;
    // XP and streak columns are server-owned; strip them defensively.
    const { total_xp, current_streak, longest_streak, last_active_day, id, ...writable } = patch;
    void total_xp; void current_streak; void longest_streak; void last_active_day; void id;
    const { data, error } = await supabase.from('profiles').update(writable).eq('id', userId).select('*').single();
    if (error) throw error;
    set({ profile: data as Profile });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },
}));
