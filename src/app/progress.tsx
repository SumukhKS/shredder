import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space } from '@/constants/theme';
import { fromDay, toDay } from '@/lib/dates';
import {
  addPhoto,
  deletePhoto,
  fetchPhotos,
  pendingPhotoCount,
  sendPendingPhotos,
  type ProgressPhoto,
} from '@/lib/progress-photos';
import { useQuery } from '@/lib/use-query';
import { useSession } from '@/stores/session';

const dateText = (day: string) => fromDay(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Progress pictures, private to you: a dated gallery, and any two side by side. */
export default function ProgressPhotos() {
  const c = useColors();
  const userId = useSession((s) => s.session?.user.id);
  const q = useQuery(fetchPhotos, '');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(() => pendingPhotoCount());
  const [error, setError] = useState<string | null>(null);
  const photos = q.data ?? [];

  useFocusEffect(
    useCallback(() => {
      if (!userId || pendingPhotoCount() === 0) return;
      sendPendingPhotos(userId).then(() => {
        setWaiting(pendingPhotoCount());
        q.reload();
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId])
  );

  async function add(source: 'camera' | 'library') {
    if (!userId) return;
    setError(null);
    if (source === 'camera') {
      const allowed = await ImagePicker.requestCameraPermissionsAsync();
      if (!allowed.granted) return setError('Allow the camera for Shredder to take a photo.');
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const r =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (r.canceled || !r.assets[0]) return;
    setBusy(true);
    try {
      const state = await addPhoto(userId, r.assets[0].uri, toDay());
      setWaiting(pendingPhotoCount());
      if (state === 'sent') await q.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that photo.');
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list.slice(-1), id]));
  }

  function remove(photo: ProgressPhoto) {
    Alert.alert('Delete this photo?', 'It is removed for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePhoto(photo);
            setPicked((list) => list.filter((x) => x !== photo.id));
            await q.reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not delete that photo.');
          }
        },
      },
    ]);
  }

  const chosen = picked
    .map((id) => photos.find((p) => p.id === id))
    .filter((p): p is ProgressPhoto => !!p)
    .sort((a, b) => a.day.localeCompare(b.day));

  return (
    <Screen padTop={false} refreshing={q.refreshing} onRefresh={q.refresh}>
      <View style={styles.row}>
        <Button label="Take photo" icon="camera-outline" loading={busy} onPress={() => add('camera')} style={{ flex: 1 }} />
        <Button
          label="Choose photo"
          icon="image-outline"
          variant="secondary"
          disabled={busy}
          onPress={() => add('library')}
          style={{ flex: 1 }}
        />
      </View>
      <AppText variant="small" color="textMuted">
        Only you can see these. Tap one photo to view it, or two to compare them.
      </AppText>
      {waiting ? (
        <AppText variant="smallBold" color="textMuted">
          {waiting} saved on this phone, will upload when you are back online.
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="smallBold" color="danger">
          {error}
        </AppText>
      ) : null}

      {chosen.length ? (
        <Card style={{ gap: Space.md }}>
          <View style={styles.row}>
            {chosen.map((p) => (
              <View key={p.id} style={{ flex: 1, gap: Space.sm }}>
                <Image
                  source={{ uri: p.url ?? undefined }}
                  style={[styles.large, { backgroundColor: c.surfaceHi }]}
                  contentFit="cover"
                />
                <AppText variant="smallBold" align="center">
                  {dateText(p.day)}
                </AppText>
                <Button label="Delete" size="sm" variant="ghost" onPress={() => remove(p)} />
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {!q.data && q.error ? (
        <EmptyState
          title="Couldn't load your photos"
          body={q.error}
          action={<Button label="Try again" variant="secondary" icon="refresh" onPress={q.reload} />}
        />
      ) : null}
      {q.data?.length === 0 ? <EmptyState title="No photos yet" body="Take one today, and compare as the weeks go by." /> : null}

      <View style={styles.grid}>
        {photos.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`Photo from ${dateText(p.day)}`}
            onPress={() => toggle(p.id)}
            style={[styles.cell, { borderColor: picked.includes(p.id) ? c.primary : c.hairline }]}>
            <Image
              source={{ uri: p.url ?? undefined }}
              style={[styles.thumb, { backgroundColor: c.surfaceHi }]}
              contentFit="cover"
            />
            <AppText variant="small" color="textMuted" align="center" numberOfLines={1}>
              {fromDay(p.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })}
            </AppText>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  cell: { width: '31%', flexGrow: 1, maxWidth: '33%', gap: 4, padding: 4, borderWidth: 2, borderRadius: Radius.row },
  thumb: { width: '100%', aspectRatio: 3 / 4, borderRadius: Radius.row - 4 },
  large: { width: '100%', aspectRatio: 3 / 4, borderRadius: Radius.row },
});
