import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Radius, Space } from '@/constants/theme';

import { AppText } from './text';
import { useColors } from './theme';

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? c.text : c.surface, borderColor: selected ? c.text : c.hairline },
      ]}>
      <AppText variant="smallBold" color={selected ? 'bg' : 'text'}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Space.sm, paddingHorizontal: Space.lg }}>
      {children}
    </ScrollView>
  );
}

/** Large tappable options used in onboarding. */
export function OptionCard({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.option,
        {
          backgroundColor: selected ? c.primarySoft : c.surface,
          borderColor: selected ? c.primary : c.hairline,
        },
      ]}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyBold">{title}</AppText>
        {detail ? (
          <AppText variant="small" color="textMuted">
            {detail}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.radio, { borderColor: selected ? c.primary : c.hairline }]}>
        {selected ? <View style={[styles.dot, { backgroundColor: c.primary }]} /> : null}
      </View>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={[styles.segment, { backgroundColor: c.hairline }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[styles.segmentItem, on && { backgroundColor: c.surface, borderColor: c.border, borderWidth: 2 }]}>
            <AppText variant="smallBold" color={on ? 'text' : 'textMuted'}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, height: 34, borderRadius: Radius.chip, borderWidth: 1.5, justifyContent: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.lg,
    borderRadius: Radius.row,
    borderWidth: 2,
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  segment: { flexDirection: 'row', borderRadius: Radius.row, padding: 4, gap: 4 },
  segmentItem: { flex: 1, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
