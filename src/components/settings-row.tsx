import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Space } from '@/constants/theme';

import { AppText } from './ui/text';
import { useColors } from './ui/theme';

/** One row in a settings list: icon, title, an optional line under it, and a chevron. */
export function SettingsRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  detail?: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceHi : c.surface, borderColor: c.hairline }]}>
      <View style={[styles.icon, { backgroundColor: c.surfaceHi }]}>
        <Ionicons name={icon} size={18} color={c.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyBold">{title}</AppText>
        {detail ? (
          <AppText variant="small" color="textMuted" numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </Pressable>
  );
}

/** A setting that is on or off, with what it does underneath. */
export function ToggleRow({
  title,
  detail,
  value,
  onChange,
  right,
}: {
  title: string;
  detail?: string;
  value: boolean;
  onChange: (on: boolean) => void;
  /** Extra control before the switch (e.g. a time). */
  right?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      onPress={() => onChange(!value)}
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyBold">{title}</AppText>
        {detail ? (
          <AppText variant="small" color="textMuted">
            {detail}
          </AppText>
        ) : null}
      </View>
      {right}
      <View style={[styles.track, { backgroundColor: value ? c.primary : c.border }]}>
        <View style={[styles.thumb, { backgroundColor: c.text, alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.row,
    borderWidth: 1,
  },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  track: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  thumb: { width: 22, height: 22, borderRadius: 11 },
});
