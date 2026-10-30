import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space } from '@/constants/theme';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How are my calorie and macro targets worked out?',
    a: 'From your gender, age, height, weight, activity and goal (Mifflin-St Jeor, times an activity factor, then a deficit or surplus for your goal). Settings > Profile > Recalculate redoes it with your latest weigh-in.',
  },
  {
    q: 'What counts as a PR?',
    a: 'A set where no earlier set of that exercise had both at least as much weight and at least as many reps. The first workout with an exercise is the baseline, so it never has PRs.',
  },
  {
    q: 'Why does an exercise say "custom"?',
    a: 'It was created by you or by an import rather than taken from the library. Shredder matches sure ones to the library once a day; for the rest use Settings > Import or export data > Match custom exercises.',
  },
  {
    q: 'Where do steps and sleep come from?',
    a: 'Health Connect on Android. Connect it in Settings > Integrations, and turn on Health Connect sync in your watch or fitness app.',
  },
  {
    q: 'Can I switch to pounds or inches?',
    a: 'Yes, in Settings > Units. Everything is stored in kg and cm, so switching back and forth never changes your data. A workout already in progress keeps the unit it started with.',
  },
  {
    q: 'How do app updates work?',
    a: 'Shredder asks before downloading a new version. Turn on auto-update in Settings > App updates to have them download by themselves; you still choose when to restart.',
  },
  {
    q: 'How do I get my data out?',
    a: 'Settings > Import or export data > Export all data saves everything you have logged as a JSON file you can keep or send anywhere.',
  },
  {
    q: 'What is the week streak?',
    a: 'The number of weeks in a row, Monday to Sunday, with at least one workout. The current week does not break it until it is over.',
  },
];

/** Settings > FAQ: tap a question to open its answer. */
export default function Faq() {
  const c = useColors();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Screen padTop={false}>
      {FAQ.map((f, i) => (
        <Pressable
          key={f.q}
          accessibilityRole="button"
          accessibilityState={{ expanded: open === i }}
          onPress={() => setOpen(open === i ? null : i)}
          style={[styles.item, { backgroundColor: c.surface, borderColor: c.hairline }]}>
          <View style={styles.head}>
            <AppText variant="bodyBold" style={{ flex: 1 }}>
              {f.q}
            </AppText>
            <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={c.textMuted} />
          </View>
          {open === i ? (
            <AppText variant="small" color="textMuted">
              {f.a}
            </AppText>
          ) : null}
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { padding: Space.md, borderRadius: Radius.row, borderWidth: 1, gap: Space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
});
