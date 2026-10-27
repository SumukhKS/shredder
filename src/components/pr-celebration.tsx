import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { create } from 'zustand';

import { Space } from '@/constants/theme';
import type { PrHit } from '@/stores/workout';

import { PrBadge } from './pr-badge';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

const usePr = create<{ hit: (PrHit & { id: number }) | null; show: (h: PrHit) => void; clear: () => void }>((set) => ({
  hit: null,
  show: (h) => set({ hit: { ...h, id: Date.now() } }),
  clear: () => set({ hit: null }),
}));

/** Play the medal animation for a personal record. */
export function celebratePr(hit: PrHit) {
  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  usePr.getState().show(hit);
}

const PARTICLES = 14;

/** Full-screen medal burst. Mount it on the screen where PRs happen; tap to dismiss. */
export function PrCelebrationHost() {
  const { hit, clear } = usePr();

  useEffect(() => {
    if (!hit) return;
    const t = setTimeout(clear, 3200);
    return () => clearTimeout(t);
  }, [hit, clear]);

  if (!hit) return null;
  return <Burst key={hit.id} hit={hit} onDone={clear} />;
}

function Burst({ hit, onDone }: { hit: PrHit; onDone: () => void }) {
  const c = useColors();
  const pop = useSharedValue(0);
  const tilt = useSharedValue(0);
  const spin = useSharedValue(0);
  const burst = useSharedValue(0);

  useEffect(() => {
    pop.value = withSpring(1, { damping: 9, stiffness: 140 });
    tilt.value = withDelay(
      250,
      withSequence(
        withTiming(-12, { duration: 120 }),
        withTiming(10, { duration: 140 }),
        withTiming(-6, { duration: 120 }),
        withTiming(0, { duration: 120 })
      )
    );
    spin.value = withRepeat(withTiming(360, { duration: 6000, easing: Easing.linear }), -1);
    burst.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [pop, tilt, spin, burst]);

  const medal = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { rotate: `${tilt.value}deg` }],
  }));
  const rays = useAnimatedStyle(() => ({
    opacity: pop.value * 0.9,
    transform: [{ rotate: `${spin.value}deg` }, { scale: 0.6 + pop.value * 0.4 }],
  }));
  const text = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ translateY: (1 - pop.value) * 24 }],
  }));

  const title =
    hit.heaviest && hit.e1rm != null
      ? 'New PR'
      : hit.heaviest
        ? 'Heaviest lift yet'
        : hit.e1rm != null
          ? 'New 1RM record'
          : 'Rep record';
  const details = [
    hit.bodyweight ? `${hit.reps} reps` : `${hit.weight} kg × ${hit.reps}`,
    hit.e1rm != null ? `est. 1RM ${hit.e1rm} kg` : null,
  ].filter(Boolean);

  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(250)} style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${hit.exerciseName}, ${details.join(', ')}. Tap to close.`}
        onPress={onDone}
        style={[styles.scrim, { backgroundColor: 'rgba(0,0,0,0.82)' }]}>
        <View style={styles.stage}>
          <Animated.View style={[styles.rays, rays]}>
            {Array.from({ length: 12 }, (_, i) => (
              <View
                key={i}
                style={[styles.ray, { backgroundColor: c.accent, transform: [{ rotate: `${i * 30}deg` }, { translateY: -92 }] }]}
              />
            ))}
          </Animated.View>
          {Array.from({ length: PARTICLES }, (_, i) => (
            <Particle key={i} index={i} progress={burst} color={i % 2 ? c.primary : c.accent} />
          ))}
          <Animated.View style={medal}>
            <PrBadge size={170} />
          </Animated.View>
        </View>

        <Animated.View style={[{ alignItems: 'center', gap: Space.xs }, text]}>
          <AppText variant="smallBold" color="accent" style={{ letterSpacing: 2 }}>
            {title.toUpperCase()}
          </AppText>
          <AppText variant="h1" align="center">
            {hit.exerciseName}
          </AppText>
          <AppText variant="h3" color="textMuted" align="center">
            {details.join('  ·  ')}
          </AppText>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function Particle({ index, progress, color }: { index: number; progress: SharedValue<number>; color: string }) {
  const angle = (index / PARTICLES) * Math.PI * 2;
  const distance = 110 + (index % 3) * 26;
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(angle) * distance * progress.value },
      { translateY: Math.sin(angle) * distance * progress.value },
      { scale: 1 - progress.value * 0.5 },
    ],
  }));
  return <Animated.View style={[styles.particle, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.xl, padding: Space.xl },
  stage: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  rays: { position: 'absolute', width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: 4, height: 34, borderRadius: 2 },
  particle: { position: 'absolute', width: 10, height: 10, borderRadius: 3 },
});
