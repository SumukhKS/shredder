import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/**
 * Lands here from the "Email confirmed" page (shredder://auth-callback#access_token=...),
 * which carries the session Supabase created when the address was verified.
 */
export default function AuthCallback() {
  const c = useColors();
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    const params = new URLSearchParams(url.split('#')[1] ?? url.split('?')[1] ?? '');
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) {
      router.replace('/');
      return;
    }
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) setError(error.message);
      else router.replace('/');
    });
  }, [url]);

  return (
    <View style={[styles.wrap, { backgroundColor: c.bg }]}>
      {error ? (
        <>
          <AppText variant="h2" align="center">
            Could not sign you in
          </AppText>
          <AppText color="textMuted" align="center">
            {error} Your email is confirmed, so you can sign in with your password.
          </AppText>
          <Button label="Go to sign in" onPress={() => router.replace('/')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={c.primary} size="large" />
          <AppText color="textMuted">Signing you in...</AppText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.lg, padding: Space.xl },
});
