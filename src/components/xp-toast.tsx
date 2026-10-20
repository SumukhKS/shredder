import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { hardShadow, Radius, Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { levelFromXp, levelTitle, XP_LABELS } from '@/lib/xp';
import { useSession } from '@/stores/session';

import { AppText } from './ui/text';
import { useColors } from './ui/theme';

interface Toast {
  id: number;
  xp: number;
  message?: string;
  levelUp?: number;
}

const useToast = create<{ toast: Toast | null; show: (t: Omit<Toast, 'id'>) => void; clear: () => void }>((set) => ({
  toast: null,
  show: (t) => set({ toast: { ...t, id: Date.now() } }),
  clear: () => set({ toast: null }),
}));

/**
 * Refresh the profile after a server-side XP award and celebrate the difference.
 * Works for triggers (food, water, steps) where the client doesn't know the amount.
 */
export async function celebrateXp(message?: string) {
  const before = useSession.getState().profile?.total_xp ?? 0;
  const profile = await useSession.getState().refreshProfile();
  if (!profile) return;
  const gained = profile.total_xp - before;
  if (gained <= 0) return;
  if (!message) {
    const { data } = await supabase.from('xp_events').select('kind').order('created_at', { ascending: false }).limit(2);
    const kinds = (data ?? []).map((e) => e.kind as string);
    const main = kinds.find((k) => k !== 'streak') ?? kinds[0];
    message = kinds.includes('streak') && main !== 'streak'
      ? `${XP_LABELS[main] ?? 'Progress'} and streak bonus`
      : (XP_LABELS[main] ?? 'Nice work');
  }
  const lvBefore = levelFromXp(before).level;
  const lvAfter = levelFromXp(profile.total_xp).level;
  useToast.getState().show({ xp: gained, message, levelUp: lvAfter > lvBefore ? lvAfter : undefined });
}

export function XpToastHost() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { toast, clear } = useToast();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clear, toast.levelUp ? 3500 : 2200);
    return () => clearTimeout(t);
  }, [toast, clear]);

  if (!toast) return null;
  return (
    <View pointerEvents="none" style={[styles.host, { top: insets.top + Space.sm }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInUp.springify().damping(14)}
        exiting={FadeOutUp}
        style={[styles.toast, { backgroundColor: c.xp, borderColor: c.border }, hardShadow(c.shadow, 4)]}>
        <AppText variant="h2" color="#FFFFFF">
          +{toast.xp} XP
        </AppText>
        <AppText variant="smallBold" color="#FFFFFF">
          {toast.levelUp ? `Level ${toast.levelUp} unlocked: ${levelTitle(toast.levelUp)}` : (toast.message ?? 'Nice work')}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  toast: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    borderRadius: Radius.card,
    borderWidth: 2,
    alignItems: 'center',
  },
});
