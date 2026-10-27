import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { bodyBack } from 'react-native-body-highlighter/dist/assets/bodyBack';
import { bodyFemaleBack } from 'react-native-body-highlighter/dist/assets/bodyFemaleBack';
import { bodyFemaleFront } from 'react-native-body-highlighter/dist/assets/bodyFemaleFront';
import { bodyFront } from 'react-native-body-highlighter/dist/assets/bodyFront';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Radius, Space, withAlpha } from '@/constants/theme';
import { mainMuscle, MUSCLE_PARTS, MUSCLE_REGIONS, muscleLoad, type Muscle, type MuscleLoad } from '@/lib/body-shapes';
import { formatVolume, MUSCLE_LABELS } from '@/lib/workouts';
import { useSession } from '@/stores/session';

import { AppText } from './ui/text';
import { useColors } from './ui/theme';

type Loads = Partial<Record<Muscle, MuscleLoad>>;
type Part = { slug?: string; path?: { common?: string[]; left?: string[]; right?: string[] } };
type FigureView = { parts: Part[]; viewBox: string; aspect: number };

// The package's own framing for each figure (x, y, width, height).
const FIGURES: Record<'male' | 'female', { front: FigureView; back: FigureView }> = {
  male: {
    front: { parts: bodyFront, viewBox: '0 0 724 1448', aspect: 724 / 1448 },
    back: { parts: bodyBack, viewBox: '724 0 724 1448', aspect: 724 / 1448 },
  },
  female: {
    front: { parts: bodyFemaleFront, viewBox: '-50 -40 734 1538', aspect: 734 / 1538 },
    back: { parts: bodyFemaleBack, viewBox: '756 0 774 1448', aspect: 774 / 1448 },
  },
};

// Solid tones (not see-through), so the filled-in body underneath doesn't show doubled-up edges.
const SKIN = '#3A3431';
const MUSCLE = '#4A4340';
const SEAM = '#1C1715';

// The figure's muscle group for each of its parts; parts not listed (head, hands, knees...) are just body.
const PART_MUSCLE = new Map<string, Muscle>(
  (Object.entries(MUSCLE_PARTS) as [Muscle, string[]][]).flatMap(([m, slugs]) => slugs.map((s) => [s, m] as const))
);
const partPaths = (p: Part) => [...(p.path?.common ?? []), ...(p.path?.left ?? []), ...(p.path?.right ?? [])];
const ORDER = MUSCLE_REGIONS.flatMap((r) => r.muscles);

/**
 * Front and back body (male or female, from the profile) with the muscles a session worked lit
 * up: bright where a muscle was the target, dim where it helped. The lit muscles glow in, then
 * breathe slowly. Below, only the muscles trained, each with a bar for its volume.
 */
export function MuscleMap({
  exercises,
}: {
  exercises: {
    name?: string;
    primary_muscle?: string;
    secondary_muscles?: string[];
    sets: { set_type: string; weight_kg?: number | null; reps?: number | null }[];
  }[];
}) {
  const c = useColors();
  const sex = useSession((s) => s.profile?.sex);
  const figure = FIGURES[sex === 'female' ? 'female' : 'male'];
  const loads = muscleLoad(exercises);
  const cardioSets = exercises
    .filter((e) => mainMuscle(e) === 'cardio')
    .reduce((n, e) => n + e.sets.filter((s) => s.set_type !== 'warmup').length, 0);

  const trained = (Object.entries(loads) as [Muscle, MuscleLoad][]).sort(
    (a, b) => b[1].volume - a[1].volume || b[1].primary - a[1].primary || ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])
  );
  // Bodyweight-only sessions have no volume, so their bars compare sets instead.
  const byVolume = trained.some(([, l]) => l.volume > 0);
  const size = (l: MuscleLoad) => (byVolume ? l.volume : l.primary + l.secondary / 2);
  const max = Math.max(1, ...trained.map(([, l]) => size(l)));

  return (
    <View style={{ gap: Space.md }}>
      <AppText variant="h3">Muscles worked</AppText>
      <View style={styles.bodies}>
        <Figure {...figure.front} loads={loads} label="Front" />
        <Figure {...figure.back} loads={loads} label="Back" />
      </View>
      {trained.length || cardioSets ? (
        <View style={{ gap: Space.md }}>
          {trained.map(([m, l]) => {
            const sets = l.primary + l.secondary;
            return (
              <View key={m} style={{ gap: 6 }}>
                <View style={styles.rowHead}>
                  <AppText variant="bodyBold" style={{ flex: 1 }}>
                    {MUSCLE_LABELS[m] ?? m}
                  </AppText>
                  <AppText variant="smallBold" color={l.primary ? 'text' : 'textMuted'}>
                    {l.volume > 0 ? `${formatVolume(l.volume)}, ` : ''}
                    {sets} set{sets === 1 ? '' : 's'}
                  </AppText>
                </View>
                <View style={[styles.track, { backgroundColor: c.surfaceHi }]}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.max(4, (size(l) / max) * 100)}%`,
                        backgroundColor: l.primary ? c.primary : withAlpha(c.primary, 0.45),
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
          {cardioSets ? (
            <View style={styles.rowHead}>
              <AppText variant="bodyBold" style={{ flex: 1 }}>
                Cardio
              </AppText>
              <AppText variant="smallBold">
                {cardioSets} set{cardioSets === 1 ? '' : 's'}
              </AppText>
            </View>
          ) : null}
          <AppText variant="small" color="textMuted">
            Bright: the muscle an exercise targets. Dim: muscles that helped (their volume counts at half).
          </AppText>
        </View>
      ) : (
        <AppText variant="small" color="textMuted">
          These exercises have no muscle group saved, so nothing is lit.
        </AppText>
      )}
    </View>
  );
}

function Figure({ parts, viewBox, aspect, loads, label }: FigureView & { loads: Loads; label: string }) {
  const c = useColors();
  const glow = useSharedValue(0);

  // Light up, then keep a slow breathing pulse so the worked muscles read as alive.
  useEffect(() => {
    glow.value = withSequence(
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }),
      withDelay(200, withRepeat(withTiming(0.72, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true))
    );
  }, [glow]);
  const litStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  const muscleOf = (p: Part) => (p.slug ? PART_MUSCLE.get(p.slug) : undefined);
  const lit = parts.filter((p) => {
    const m = muscleOf(p);
    return m && loads[m];
  });
  const litFill = (p: Part) => (loads[muscleOf(p)!]?.primary ? c.primary : withAlpha(c.primary, 0.45));

  return (
    <View style={{ flex: 1, alignItems: 'center', gap: Space.xs }}>
      <View style={[styles.figure, { aspectRatio: aspect }]}>
        <Svg width="100%" height="100%" viewBox={viewBox} style={StyleSheet.absoluteFill}>
          {/* A thick outline of every part fills the gaps between muscles, so the body reads as one solid figure. */}
          {parts.flatMap((p, i) =>
            partPaths(p).map((d, j) => (
              <Path key={`u${i}-${j}`} d={d} fill={SKIN} stroke={SKIN} strokeWidth={14} strokeLinejoin="round" />
            ))
          )}
          {parts.flatMap((p, i) =>
            partPaths(p).map((d, j) => (
              <Path key={`${i}-${j}`} d={d} fill={muscleOf(p) ? MUSCLE : SKIN} stroke={SEAM} strokeWidth={2} />
            ))
          )}
        </Svg>
        <Animated.View entering={FadeIn.duration(300)} style={[StyleSheet.absoluteFill, litStyle]}>
          <Svg width="100%" height="100%" viewBox={viewBox}>
            {lit.flatMap((p, i) =>
              partPaths(p).map((d, j) => <Path key={`${i}-${j}`} d={d} fill={litFill(p)} stroke={SEAM} strokeWidth={2} />)
            )}
          </Svg>
        </Animated.View>
      </View>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bodies: { flexDirection: 'row', gap: Space.md },
  figure: { width: '100%', maxWidth: 160 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: Space.sm },
  track: { height: 10, borderRadius: Radius.chip, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.chip },
});
