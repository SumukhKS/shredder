import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Radius, Space } from '@/constants/theme';
import { fetchMarkedDays, type CalendarKind } from '@/lib/daily';
import { addDays, dayLabel, firstOfMonth, fromDay, mondayOf, toDay } from '@/lib/dates';
import { useQuery } from '@/lib/use-query';

import { IconButton } from './ui/button';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

const MARK_LABELS: Record<CalendarKind, string> = {
  workout: 'workout done',
  food: 'food logged',
  water: 'water goal hit',
  steps: 'steps goal hit',
  sleep: 'sleep goal hit',
};

/**
 * Monday-to-Sunday strip for picking a day, with a drop-down for the whole month. Days with
 * activity (a workout, food logged, or a habit goal hit) get the blaze fill and the selected day
 * is outlined. The arrows step a week, or a month while the month is open.
 */
export function WeekCalendar({
  day,
  onChange,
  kind,
  target = 0,
  version = 0,
  summary,
}: {
  day: string;
  onChange: (day: string) => void;
  /** What a highlighted day means; the calendar loads those days itself. */
  kind: CalendarKind;
  /** The daily goal for water, steps or sleep: a day is highlighted once it's reached. */
  target?: number;
  /** Bump after logging something so the highlights reload. */
  version?: number;
  /** Line under the calendar, from the number of highlighted days in the week or month shown. */
  summary?: (count: number, span: 'week' | 'month') => string;
}) {
  const c = useColors();
  const today = toDay();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(firstOfMonth(day));

  const monday = mondayOf(day);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const grid = monthGrid(month);
  const from = open && grid[0] < monday ? grid[0] : monday;
  const lastShown = open ? grid[grid.length - 1] : week[6];
  const to = lastShown > week[6] ? lastShown : week[6];
  const marks = useQuery(() => fetchMarkedDays(kind, from, to, target), `${kind}|${from}|${to}|${target}|${version}`);
  const marked = marks.data ?? new Set<string>();

  const atEnd = open ? month >= firstOfMonth(today) : week.includes(today) || week[0] > today;
  const monthDays = grid.filter((d) => d.startsWith(month.slice(0, 7)));
  const count = (open ? monthDays : week).filter((d) => marked.has(d)).length;

  function step(dir: 1 | -1) {
    if (open) {
      const [y, m] = month.split('-').map(Number);
      setMonth(firstOfMonth(toDay(new Date(y, m - 1 + dir, 1))));
    } else {
      const next = addDays(day, dir * 7);
      onChange(next > today ? today : next);
    }
  }

  function toggle() {
    if (!open) setMonth(firstOfMonth(day));
    setOpen(!open);
  }

  const cell = (d: string, showLetter: boolean) => (
    <DayCell
      key={d}
      d={d}
      today={today}
      selected={d === day}
      done={marked.has(d)}
      markLabel={MARK_LABELS[kind]}
      letter={showLetter}
      onPress={() => {
        onChange(d);
        setOpen(false);
      }}
    />
  );

  return (
    <View style={{ gap: Space.md }}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" label={open ? 'Previous month' : 'Previous week'} onPress={() => step(-1)} />
        {open ? (
          // The month view is titled by the month itself; tapping it folds back to the week.
          <Pressable
            onPress={toggle}
            accessibilityRole="button"
            accessibilityState={{ expanded: true }}
            accessibilityLabel="Hide the month"
            style={styles.monthTitle}>
            <AppText variant="h1" numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1 }}>
              {fromDay(month).toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </AppText>
            <Ionicons name="chevron-up" size={18} color={c.textMuted} />
          </Pressable>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Pressable onPress={() => onChange(today)} accessibilityRole="button" accessibilityLabel="Jump to today">
              <AppText variant="h1">{dayLabel(day)}</AppText>
            </Pressable>
            <Pressable
              onPress={toggle}
              accessibilityRole="button"
              accessibilityState={{ expanded: false }}
              accessibilityLabel="Show the whole month"
              hitSlop={8}
              style={({ pressed }) => [styles.monthButton, { backgroundColor: pressed ? c.surfaceHi : c.surface }]}>
              <AppText variant="smallBold">
                {fromDay(day).toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </AppText>
              <Ionicons name="chevron-down" size={14} color={c.textMuted} />
            </Pressable>
          </View>
        )}
        <IconButton
          icon="chevron-forward"
          label={open ? 'Next month' : 'Next week'}
          color={atEnd ? c.hairline : c.text}
          onPress={() => !atEnd && step(1)}
        />
      </View>

      {open ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ gap: Space.sm }}>
          <View style={styles.week}>
            {week.map((d) => (
              <View key={d} style={styles.cell}>
                <AppText variant="smallBold" color={d === today ? 'primary' : 'textMuted'} style={styles.letter}>
                  {fromDay(d).toLocaleDateString(undefined, {
                    weekday: 'narrow',
                  })}
                </AppText>
              </View>
            ))}
          </View>
          {Array.from({ length: grid.length / 7 }, (_, r) => (
            <View key={r} style={styles.week}>
              {grid
                .slice(r * 7, r * 7 + 7)
                .map((d) => (d.startsWith(month.slice(0, 7)) ? cell(d, false) : <View key={d} style={styles.cell} />))}
            </View>
          ))}
        </Animated.View>
      ) : (
        <View style={styles.week}>{week.map((d) => cell(d, true))}</View>
      )}

      {summary && marks.data ? (
        <AppText variant="small" color="textMuted" align="center">
          {summary(count, open ? 'month' : 'week')}
        </AppText>
      ) : null}
    </View>
  );
}

function DayCell({
  d,
  today,
  selected,
  done,
  markLabel,
  letter,
  onPress,
}: {
  d: string;
  today: string;
  selected: boolean;
  done: boolean;
  markLabel: string;
  letter: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const future = d > today;
  const date = fromDay(d);
  return (
    <Pressable
      disabled={future}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${date.toDateString()}${done ? `, ${markLabel}` : ''}`}
      style={[styles.cell, future && { opacity: 0.35 }]}>
      {letter ? (
        <AppText variant="smallBold" color={d === today ? 'primary' : 'textMuted'} style={styles.letter}>
          {date.toLocaleDateString(undefined, { weekday: 'narrow' })}
        </AppText>
      ) : null}
      <View style={[styles.ring, { borderColor: selected ? c.text : 'transparent' }]}>
        {done ? (
          <View style={[styles.dot, { backgroundColor: c.primary }]}>
            <AppText variant="bodyBold" color="onPrimary">
              {date.getDate()}
            </AppText>
          </View>
        ) : (
          <View style={styles.dot}>
            <AppText variant="bodyBold" color={d === today ? 'primary' : 'textMuted'}>
              {date.getDate()}
            </AppText>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** Every day of the Monday-first weeks that cover the month starting on `first`. */
function monthGrid(first: string): string[] {
  const start = mondayOf(first);
  const [y, m] = first.split('-').map(Number);
  const last = toDay(new Date(y, m, 0));
  const days = Math.round((fromDay(last).getTime() - fromDay(start).getTime()) / 86400000) + 1;
  return Array.from({ length: Math.ceil(days / 7) * 7 }, (_, i) => addDays(start, i));
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  monthTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  monthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.md,
    paddingVertical: 4,
    borderRadius: Radius.chip,
  },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { flex: 1, alignItems: 'center', gap: 6 },
  letter: { fontSize: 11 },
  // Exactly half of each size (44 and 36), so Android draws true circles.
  ring: { width: 44, height: 44, borderWidth: 2, borderRadius: 22, padding: 2, overflow: 'hidden' },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
