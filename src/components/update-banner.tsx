import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, hardShadow, Radius, Space } from '@/constants/theme';

import { IconTile } from './ui/icon-tile';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

/** Look for a new version on the server and download it in the background. */
export async function checkForAppUpdate(): Promise<'none' | 'downloaded' | 'disabled'> {
  if (__DEV__ || !Updates.isEnabled) return 'disabled';
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return 'none';
  await Updates.fetchUpdateAsync();
  return 'downloaded';
}

/** Restarts into the downloaded version. The native reload screen covers the gap while the new code loads. */
function restart() {
  return Updates.reloadAsync({
    reloadScreenOptions: { backgroundColor: Colors.dark.bg, fade: true, spinner: { enabled: true, color: Colors.dark.primary } },
  });
}

/**
 * In-app updates: checks on launch (and restarts into a new version found then) and
 * whenever the app comes back to the foreground, offering a one-tap restart for those.
 * While an update downloads or installs, the screen says so instead of going blank.
 */
export function UpdateBanner() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { isUpdatePending, isDownloading } = Updates.useUpdates();
  const [installing, setInstalling] = useState(false);

  function install() {
    setInstalling(true);
    // Let the "Updating" screen show before the reload replaces it.
    setTimeout(() => restart().catch(() => setInstalling(false)), 900);
  }

  useEffect(() => {
    // Right after opening, apply a new version straight away instead of waiting for the next launch.
    const opened = Date.now();
    checkForAppUpdate()
      .then((r) => {
        if (r === 'downloaded' && Date.now() - opened < 20_000) install();
      })
      .catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForAppUpdate().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  if (installing) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={[styles.cover, { backgroundColor: c.bg }]}>
        <IconTile icon="barbell" size={56} />
        <AppText variant="h2">Updating Shredder</AppText>
        <AppText color="textMuted" align="center">
          Installing the latest version. This takes a few seconds.
        </AppText>
        <ActivityIndicator color={c.primary} size="large" style={{ marginTop: Space.md }} />
      </Animated.View>
    );
  }

  if (isDownloading) {
    return (
      <View pointerEvents="none" style={[styles.host, { top: insets.top + Space.sm }]}>
        <Animated.View entering={FadeInUp.springify()} style={[styles.pill, { backgroundColor: c.surfaceHi, borderColor: c.border }]}>
          <ActivityIndicator color={c.primary} size="small" />
          <AppText variant="smallBold">Downloading an update...</AppText>
        </Animated.View>
      </View>
    );
  }

  if (!isUpdatePending) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 96 }]}>
      <Animated.View entering={FadeInDown.springify()}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="A new version is ready. Restart to update."
          onPress={install}
          style={[styles.banner, { backgroundColor: c.primary, borderColor: c.border }, hardShadow(c.shadow, 4)]}>
          <Ionicons name="cloud-download" size={20} color={c.onPrimary} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold" color="onPrimary">
              Update ready
            </AppText>
            <AppText variant="small" color="onPrimary">
              Tap to restart into the new version.
            </AppText>
          </View>
          <Ionicons name="refresh" size={20} color={c.onPrimary} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: Space.lg, right: Space.lg, zIndex: 100, alignItems: 'center' },
  cover: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    padding: Space.xl,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.chip,
    borderWidth: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.lg,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
});
