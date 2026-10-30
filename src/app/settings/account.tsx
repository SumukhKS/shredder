import { Alert } from 'react-native';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { hasWaitingEntries } from '@/lib/outbox';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/stores/session';

/** Settings > Account: who you're signed in as, a new password, and signing out. */
export default function AccountSettings() {
  const { session, signOut } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function confirmSignOut() {
    if (!hasWaitingEntries()) return signOut();
    Alert.alert(
      'Not everything has synced',
      'Some entries are only on this phone. They stay here and will sync next time you sign in to this account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: signOut },
      ]
    );
  }

  const error =
    password && password.length < 8
      ? 'At least 8 characters.'
      : confirm && confirm !== password
        ? "The passwords don't match."
        : null;

  async function changePassword() {
    setSaving(true);
    setMessage(null);
    try {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) throw e;
      setPassword('');
      setConfirm('');
      setMessage('Password changed.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not change the password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen padTop={false}>
      <Card tone="flat" style={{ gap: Space.xs }}>
        <AppText variant="small" color="textMuted">
          Signed in as
        </AppText>
        <AppText variant="bodyBold">{session?.user.email}</AppText>
      </Card>

      <SectionHeader title="Change password" />
      <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      <Field
        label="Repeat it"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoCapitalize="none"
        error={error ?? undefined}
      />
      {message ? (
        <AppText variant="smallBold" color="textMuted">
          {message}
        </AppText>
      ) : null}
      <Button
        label="Change password"
        variant="secondary"
        loading={saving}
        disabled={!password || password !== confirm || !!error}
        onPress={changePassword}
      />

      <Button label="Sign out" variant="danger" onPress={confirmSignOut} style={{ marginTop: Space.xl }} />
    </Screen>
  );
}
