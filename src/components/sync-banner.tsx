import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { useOutboxVersion, waitingEntries } from '@/lib/outbox';

/** A small note while entries are only on this phone, or when the server refused one. */
export function SyncBanner() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  useOutboxVersion();
  const entries = waitingEntries();
  const refused = entries.some((e) => e.failed);
  // Entries that go through at once never show it: only ones that have already missed a send.
  if (!refused && !entries.some((e) => e.attempts > 0)) return null;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!refused}
      onPress={() => router.push('/settings/data')}
      style={[styles.banner, { top: insets.top + Space.xs, backgroundColor: c.surfaceHi, borderColor: c.hairline }]}>
      <AppText variant="small" color={refused ? 'danger' : 'textMuted'}>
        {refused ? 'An entry needs attention. Tap to see it.' : 'Saved on this phone, will sync'}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
