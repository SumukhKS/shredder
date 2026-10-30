import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/ui/button';
import { Segmented } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { IconTile } from '@/components/ui/icon-tile';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup';

// The sign-up email lands on this page (served by the Cloudflare worker in proxy/), which reopens the app.
const CONFIRMED_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/confirmed`;

export default function AuthScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resending, setResending] = useState(false);
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  async function submit() {
    setError(null);
    setNotice(null);
    setUnconfirmed(false);
    if (!email.includes('@')) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() || undefined }, emailRedirectTo: CONFIRMED_URL },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice(`We sent a link to ${email.trim()}. Tap it to confirm your email and you'll be signed in.`);
          setUnconfirmed(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error?.code === 'email_not_confirmed') {
          setUnconfirmed(true);
          throw new Error('Confirm your email first: tap the link we sent you, or resend it below.');
        }
        if (error) throw error;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setResending(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: CONFIRMED_URL },
      });
      if (error) throw error;
      setNotice(`Sent a new link to ${email.trim()}. It can take a minute; check spam too.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend the email. Try again in a minute.');
    } finally {
      setResending(false);
    }
  }

  return (
    // The form sits in the middle of the screen. When the keyboard opens, the padding shrinks the
    // space it's centred in, so it slides up and stays visible (and scrolls if it no longer fits).
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.wrap, { paddingTop: insets.top + Space.xl, paddingBottom: insets.bottom + Space.xl }]}>
        <Animated.View entering={FadeInDown.duration(500)} style={{ gap: Space.md }}>
          <IconTile icon="barbell" size={56} />
          <AppText variant="hero">Shredder</AppText>
          <AppText variant="body" color="textMuted" style={{ maxWidth: 320 }}>
            Log lifts and meals in one place, and see your progress.
          </AppText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(500)} style={{ gap: Space.lg }}>
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
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="What should we call you?"
              autoComplete="name"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
          ) : null}
          <Field
            ref={emailRef}
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <Field
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            returnKeyType="go"
            error={error}
            onSubmitEditing={submit}
            right={
              <IconButton
                icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                label={showPassword ? 'Hide password' : 'Show password'}
                color={c.textMuted}
                size={20}
                onPress={() => setShowPassword((v) => !v)}
              />
            }
          />
          {notice ? (
            <AppText variant="smallBold" color="success">
              {notice}
            </AppText>
          ) : null}
          <Button label={mode === 'signup' ? 'Create account' : 'Sign in'} size="lg" loading={busy} onPress={submit} />
          {unconfirmed ? (
            <Button label="Resend email" icon="mail-outline" variant="ghost" loading={resending} onPress={resend} />
          ) : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    paddingHorizontal: Space.xl,
    justifyContent: 'center',
    gap: Space.xl,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
});
