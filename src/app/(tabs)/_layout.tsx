import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { glow, Gradients, Radius, Space } from '@/constants/theme';
import { clock } from '@/lib/dates';
import { useTodayLayout } from '@/stores/today-layout';
import { completedSetCount, useWorkout } from '@/stores/workout';

const TABS: { name: string; label: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'index', label: 'Today', icon: 'flash-outline', iconOn: 'flash' },
  { name: 'train', label: 'Train', icon: 'barbell-outline', iconOn: 'barbell' },
  { name: 'fuel', label: 'Fuel', icon: 'restaurant-outline', iconOn: 'restaurant' },
  { name: 'progress', label: 'Progress', icon: 'trending-up-outline', iconOn: 'trending-up' },
];

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  // Tabs turned off under Customize layout drop out of the bar.
  const hiddenTabs = useTodayLayout((s) => s.hiddenTabs as string[]);
  return (
    <View style={{ backgroundColor: c.bg }}>
      <ActiveWorkoutBanner />
      <View
        style={[
          styles.bar,
          { backgroundColor: c.surface, borderColor: c.border, marginBottom: Math.max(insets.bottom, Space.md) },
          glow('rgba(255,90,31,0.10)', 20),
        ]}>
        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab || hiddenTabs.includes(tab.name)) return null;
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                if (!focused) navigateToTab(route.key);
              }}
              style={[styles.item, focused && glow(c.glow, 14)]}>
              {focused ? (
                <LinearGradient
                  colors={Gradients.blaze}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: Radius.row }]}
                />
              ) : null}
              <Ionicons name={focused ? tab.iconOn : tab.icon} size={22} color={focused ? c.onPrimary : c.textMuted} />
              <AppText variant="smallBold" color={focused ? 'onPrimary' : 'textMuted'} style={{ fontSize: 11 }}>
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Persistent "workout in progress" strip, so a session is never lost behind a tab. */
function ActiveWorkoutBanner() {
  const c = useColors();
  const router = useRouter();
  const active = useWorkout((s) => s.active);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;
  const elapsed = (now - new Date(active.startedAt).getTime()) / 1000;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Resume workout"
      onPress={() => router.push('/workout/active')}
      style={[styles.banner, { borderColor: c.border }]}>
      <LinearGradient
        colors={Gradients.blaze}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: Radius.row - 2 }]}
      />
      <Ionicons name="barbell" size={18} color={c.onAccent} />
      <AppText variant="bodyBold" color={c.onAccent} style={{ flex: 1 }} numberOfLines={1}>
        {active.name}
      </AppText>
      <AppText variant="smallBold" color={c.onAccent}>
        {completedSetCount(active)} sets, {clock(elapsed)}
      </AppText>
      <Ionicons name="chevron-up" size={18} color={c.onAccent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    marginHorizontal: Space.lg,
    padding: 6,
    gap: 4,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 8, borderRadius: Radius.row },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.row,
    borderWidth: 2,
  },
});
