import * as Haptics from 'expo-haptics';
import { useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Space } from '@/constants/theme';
import { addDays, mondayOf, toDay } from '@/lib/dates';

const DISTANCE = 70;
const VELOCITY = 600;
const settle = { damping: 22, stiffness: 240 };

/**
 * Swipe the content sideways to change day, like turning pages: drag right for the day before,
 * left for the day after. Swiping stays inside the week shown in the calendar (and never goes
 * past today); the calendar's arrows change week.
 */
export function SwipeDays({ day, onChange, children }: { day: string; onChange: (day: string) => void; children: ReactNode }) {
  const tx = useSharedValue(0);
  const shown = useSharedValue(day);

  // Slide the new day in from the side it came from: later days from the right.
  useEffect(() => {
    if (shown.value === day) return;
    tx.value = (day > shown.value ? 1 : -1) * 60;
    tx.value = withSpring(0, settle);
    shown.value = day;
  }, [day, tx, shown]);

  function step(dir: 1 | -1) {
    const next = addDays(day, dir);
    const ok = mondayOf(next) === mondayOf(day) && next <= toDay();
    if (!ok) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    onChange(next);
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      tx.set(e.translationX * 0.35);
    })
    .onEnd((e) => {
      const far = Math.abs(e.translationX) > DISTANCE || Math.abs(e.velocityX) > VELOCITY;
      tx.set(withTiming(0, { duration: 160 }));
      if (far) scheduleOnRN(step, e.translationX > 0 ? -1 : 1);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    opacity: 1 - Math.min(0.35, Math.abs(tx.value) / 200),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ gap: Space.lg }, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}
