import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/profile-card';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { toDay } from '@/lib/dates';
import { ageFrom, uploadAvatar } from '@/lib/profile';
import { usePicker } from '@/stores/picker';
import { useSession } from '@/stores/session';
import type { Sex } from '@/types/db';

const BIO_MAX = 300;

/** Picture, name, bio, gender and birthday. */
export default function EditProfile() {
  const c = useColors();
  const { profile, session, updateProfile } = useSession();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [sex, setSex] = useState<Sex | null>(profile?.sex ?? null);
  const [birth] = useState(() => profile?.birthday?.split('-') ?? []);
  const [year, setYear] = useState(birth[0] ?? (profile?.birth_year ? String(profile.birth_year) : ''));
  const [month, setMonth] = useState(birth[1] ? String(Number(birth[1])) : '');
  const [day, setDay] = useState(birth[2] ? String(Number(birth[2])) : '');
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick up the photo coming back from the cropper.
  useFocusEffect(
    useCallback(() => {
      const { cropped, setCropped } = usePicker.getState();
      const userId = useSession.getState().session?.user.id;
      if (!cropped || !userId) return;
      setCropped(null);
      setUploading(true);
      uploadAvatar(userId, cropped, 'image/jpeg')
        .then(async (url) => {
          setAvatar(url);
          await useSession.getState().updateProfile({ avatar_url: url });
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not upload the picture.'))
        .finally(() => setUploading(false));
    }, [])
  );

  if (!profile || !session) return null;

  // A full, real date that's at least 10 years ago, or null.
  const birthday = (() => {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const age = ageFrom(iso, toDay());
    return age >= 10 && age <= 110 ? iso : null;
  })();
  const birthdayTyped = !!(year || month || day);

  async function pickPhoto() {
    setError(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const asset = r.assets?.[0];
    if (r.canceled || !asset) return;
    router.push({ pathname: '/profile/crop', params: { uri: asset.uri, width: asset.width, height: asset.height } });
  }

  async function removePhoto() {
    setAvatar(null);
    await updateProfile({ avatar_url: null });
  }

  async function save() {
    if (birthdayTyped && !birthday) return setError('Enter a real birthday: day, month and a four-digit year.');
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        display_name: name.trim() || null,
        bio: bio.trim() || null,
        sex,
        birthday,
        ...(birthday ? { birth_year: Number(birthday.slice(0, 4)) } : {}),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen padTop={false}>
      <View style={{ alignItems: 'center', gap: Space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
          onPress={pickPhoto}
          disabled={uploading}>
          <Avatar profile={{ avatar_url: avatar, display_name: name }} size={104} />
          {uploading ? (
            <View style={[StyleSheet.absoluteFill, styles.busy]}>
              <ActivityIndicator color={c.primary} />
            </View>
          ) : null}
        </Pressable>
        <View style={{ flexDirection: 'row', gap: Space.sm }}>
          <Button
            label={avatar ? 'Change picture' : 'Add picture'}
            size="sm"
            variant="secondary"
            icon="image-outline"
            onPress={pickPhoto}
          />
          {avatar ? <Button label="Remove" size="sm" variant="ghost" onPress={removePhoto} /> : null}
        </View>
      </View>

      <Field label="Name" value={name} onChangeText={setName} maxLength={40} />
      <Field
        label="Bio"
        value={bio}
        onChangeText={setBio}
        multiline
        maxLength={BIO_MAX}
        hint={`${bio.length}/${BIO_MAX}`}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
        placeholder="Training for my first powerlifting meet"
      />

      <AppText variant="smallBold" color="textMuted">
        Gender
      </AppText>
      <Segmented<Sex>
        options={[
          { key: 'male', label: 'Male' },
          { key: 'female', label: 'Female' },
        ]}
        value={sex ?? ('' as Sex)}
        onChange={setSex}
      />
      <AppText variant="small" color="textMuted">
        Used for calorie targets, body fat and the body figure.
      </AppText>

      <AppText variant="smallBold" color="textMuted">
        Birthday
      </AppText>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="Day" value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} placeholder="15" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Month" value={month} onChangeText={setMonth} keyboardType="number-pad" maxLength={2} placeholder="6" />
        </View>
        <View style={{ flex: 1.4 }}>
          <Field label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} placeholder="1998" />
        </View>
      </View>

      {error ? (
        <AppText variant="smallBold" color="danger">
          {error}
        </AppText>
      ) : null}
      <Button label="Save" size="lg" loading={saving} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.md },
  busy: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 52 },
});
