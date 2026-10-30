import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { create } from 'zustand';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { enqueue } from '@/lib/outbox';
import { useSession } from '@/stores/session';

/** Replay from Settings, and how much of the screen the tab bar takes so the tour leaves it lit. */
export const useTour = create<{ replay: boolean; barHeight: number }>(() => ({ replay: false, barHeight: 0 }));

const STEPS: { tab: Href; title: string; body: string }[] = [
  {
    tab: '/',
    title: 'Today',
    body: 'Your food, water, steps, sleep and workout at a glance. Tap a card for its details, and use Customize layout to reorder or resize the cards.',
  },
  {
    tab: '/',
    title: 'Calendar',
    body: 'The calendar button at the top of Today shows any past day. Tap what you logged that day to see or change it.',
  },
  {
    tab: '/train',
    title: 'Start a workout',
    body: 'Start an empty workout or one of your routines, then log each set as you go. It keeps running if you leave the screen.',
  },
  {
    tab: '/train',
    title: 'Routines, history and exercises',
    body: 'Train has three parts: your routines, every workout you logged, and the full exercise library, where you can add your own.',
  },
  {
    tab: '/fuel',
    title: 'Food',
    body: 'Search or scan to log a meal. My Recipes saves dishes you cook to log by the serving, and My Foods holds foods you create.',
  },
  {
    tab: '/profile',
    title: 'Your progress',
    body: 'Daily, weekly and monthly graphs of your training and habits, with body measurements and trends below.',
  },
  {
    tab: '/',
    title: 'No connection? Keep logging',
    body: 'Everything you log is saved on this phone first and sent when you are back online, so nothing is lost.',
  },
];

/** Short tour after onboarding, once per account. Each step opens its tab, which stays lit in the bar below. */
export function AppTour() {
  const seen = useSession((s) => s.profile?.tour_seen);
  const replay = useTour((s) => s.replay);
  const barHeight = useTour((s) => s.barHeight);
  // A profile saved on the phone before this existed has no value: only an explicit false shows it.
  const showing = replay || seen === false;
  const [step, setStep] = useState(0);
  const tab = STEPS[step].tab;

  useEffect(() => {
    if (showing) router.navigate(tab);
  }, [showing, tab]);

  if (!showing) return null;

  function finish() {
    setStep(0);
    useTour.setState({ replay: false });
    const { profile } = useSession.getState();
    if (profile && profile.tour_seen !== true) {
      useSession.setState({ profile: { ...profile, tour_seen: true } });
      enqueue({ kind: 'update', table: 'profiles', values: { tour_seen: true }, match: { id: profile.id } });
    }
    router.navigate('/');
  }

  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <View style={[styles.dim, { bottom: barHeight }]}>
      <Card style={{ gap: Space.md }}>
        <AppText variant="small" color="textMuted">
          {step + 1} of {STEPS.length}
        </AppText>
        <AppText variant="h2">{s.title}</AppText>
        <AppText>{s.body}</AppText>
        <View style={styles.row}>
          {last ? null : <Button label="Skip" variant="ghost" onPress={finish} style={{ flex: 1 }} />}
          <Button label={last ? 'Done' : 'Next'} onPress={() => (last ? finish() : setStep(step + 1))} style={{ flex: 1 }} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
    padding: Space.lg,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  row: { flexDirection: 'row', gap: Space.sm },
});
