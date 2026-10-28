import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, hardShadow, Radius, Space } from '@/constants/theme';
import { useAppSettings } from '@/stores/app-settings';

import { Button } from './ui/button';
import { IconTile } from './ui/icon-tile';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

/** How long before coming back to the app looks for a new version again. */
const RECHECK_MS = 6 * 3600_000;
let lastCheck = 0;

/** Ask the server whether a new version exists. Nothing is downloaded. */
export async function checkForAppUpdate(): Promise<'none' | 'available' | 'disabled'> {
  if (__DEV__ || !Updates.isEnabled) return 'disabled';
  lastCheck = Date.now();
  const check = await Updates.checkForUpdateAsync();
  return check.isAvailable ? 'available' : 'none';
}

/** Restarts into the downloaded version. The native reload screen covers the gap while the new code loads. */
function restart() {
  return Updates.reloadAsync({
    reloadScreenOptions: { backgroundColor: Colors.dark.bg, fade: true, spinner: { enabled: true, color: Colors.dark.primary } },
  });
}

/**
 * In-app updates. The app looks for a new version when it opens (and again when it comes back
 * after a few hours) and never installs one without being asked. With auto-update on (Settings)
 * the new version downloads quietly and a banner offers a restart; with it off, a pop-up asks
 * before downloading. While an update downloads or installs, the screen says so.
 */
export function UpdateBanner() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const autoUpdate = useAppSettings((s) => s.autoUpdate);
  const { isUpdateAvailable, isUpdatePending, isDownloading } = Updates.useUpdates();
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [failed, setFailed] = useState(false);

  function install() {
    setInstalling(true);
    // Let the "Updating" screen show before the reload replaces it.
    setTimeout(() => restart().catch(() => setInstalling(false)), 900);
  }

  async function updateNow() {
    setDismissed(true);
    setFailed(false);
    try {
      await Updates.fetchUpdateAsync();
      install();
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    function look() {
      checkForAppUpdate()
        .then((r) => {
          if (r !== 'available') return;
          setDismissed(false);
          if (useAppSettings.getState().autoUpdate) Updates.fetchUpdateAsync().catch(() => {});
        })
        .catch(() => {});
    }
    look();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheck > RECHECK_MS) look();
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

  if (isUpdatePending) {
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

  // Auto-update off: ask before downloading anything.
  if (isUpdateAvailable && !autoUpdate && (!dismissed || failed)) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
        <Animated.View
          entering={FadeInDown.springify()}
          accessibilityViewIsModal
          style={[styles.dialog, { backgroundColor: c.surface, borderColor: c.border }]}>
          <IconTile icon="cloud-download" size={48} />
          <AppText variant="h2">Update available</AppText>
          <AppText color="textMuted">
            {failed
              ? 'The download did not finish. Check your connection and try again.'
              : 'A new version of Shredder is ready. Updating takes a few seconds and restarts the app.'}
          </AppText>
          <View style={{ gap: Space.sm, alignSelf: 'stretch' }}>
            <Button label={failed ? 'Try again' : 'Update now'} icon="cloud-download-outline" onPress={updateNow} />
            <Button
              label="Later"
              variant="ghost"
              onPress={() => {
                setDismissed(true);
                setFailed(false);
              }}
            />
          </View>
          <AppText variant="small" color="textMuted">
            You can update any time from Settings, or turn on auto-update there.
          </AppText>
        </Animated.View>
      </Animated.View>
    );
  }

  return null;
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
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 150,
    justifyContent: 'center',
    padding: Space.xl,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  dialog: { borderRadius: Radius.card, borderWidth: 1, padding: Space.xl, gap: Space.md, alignItems: 'flex-start' },
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
