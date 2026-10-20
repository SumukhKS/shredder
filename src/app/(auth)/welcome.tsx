import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { hardShadow, Radius, Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setNotice(null);
    if (!email.includes('@')) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() || undefined } },
        });
        if (error) throw error;
        if (!data.session) setNotice('Check your inbox to confirm your email, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.wrap, { paddingTop: insets.top + Space.xxl, paddingBottom: insets.bottom + Space.xl }]}>
        <View style={{ gap: Space.md }}>
          <View style={[styles.badge, { backgroundColor: c.xp, borderColor: c.border }, hardShadow(c.shadow, 3)]}>
            <AppText variant="smallBold" color="#FFFFFF">
              LV 1
            </AppText>
          </View>
          <AppText variant="hero">Shredder</AppText>
          <AppText variant="body" color="textMuted" style={{ maxWidth: 320 }}>
            Log lifts and meals in one place. Every set, meal and glass of water earns XP.
          </AppText>
        </View>

        <View style={{ gap: Space.lg }}>
          <Segmented<Mode>
            options={[
              { key: 'signup', label: 'Create account' },
              { key: 'signin', label: 'Sign in' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
              setNotice(null);
            }}
          />
          {mode === 'signup' ? (
            <Field label="Name" value={name} onChangeText={setName} placeholder="What should we call you?" autoComplete="name" />
          ) : null}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            error={error}
            onSubmitEditing={submit}
          />
          {notice ? (
            <AppText variant="smallBold" color="success">
              {notice}
            </AppText>
          ) : null}
          <Button
            label={mode === 'signup' ? 'Create account' : 'Sign in'}
            size="lg"
            loading={busy}
            onPress={submit}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: Space.xl, justifyContent: 'space-between', maxWidth: 520, width: '100%', alignSelf: 'center' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.chip, borderWidth: 2 },
});
