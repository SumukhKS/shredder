import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { PlusJakartaSans_500Medium, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColors, useIsDark } from '@/components/ui/theme';
import { XpToastHost } from '@/components/xp-toast';
import { Fonts } from '@/constants/theme';
import { useSession } from '@/stores/session';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_800ExtraBold,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_700Bold,
  });
  const { ready, session, profile, init } = useSession();
  const dark = useIsDark();
  const c = useColors();

  useEffect(() => init(), [init]);

  const signedIn = !!session;
  const profileLoaded = !signedIn || !!profile;
  const appReady = fontsLoaded && ready && profileLoaded;

  useEffect(() => {
    if (appReady) SplashScreen.hideAsync();
  }, [appReady]);

  if (!appReady) return null;

  const onboarded = !!profile?.onboarded;
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: c.bg, card: c.bg, text: c.text, primary: c.primary, border: c.hairline },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTintColor: c.text,
            headerStyle: { backgroundColor: c.bg },
            headerTitleStyle: { fontFamily: Fonts.displaySemi },
            headerBackTitleStyle: { fontFamily: Fonts.body },
            contentStyle: { backgroundColor: c.bg },
          }}>
          <Stack.Protected guard={!signedIn} redirectTo="/">
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack.Protected>

          <Stack.Protected guard={signedIn && !onboarded} redirectTo={signedIn ? '/' : '/welcome'}>
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          </Stack.Protected>

          <Stack.Protected guard={signedIn && onboarded} redirectTo={signedIn ? '/onboarding' : '/welcome'}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="workout/active"
              options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }}
            />
            <Stack.Screen name="workout/[id]" options={{ title: 'Workout', headerTransparent: false }} />
            <Stack.Screen name="workout/exercises" options={{ presentation: 'modal', title: 'Add exercises', headerTransparent: false }} />
            <Stack.Screen name="routine/edit" options={{ title: 'Routine', headerTransparent: false }} />
            <Stack.Screen name="food/search" options={{ title: 'Log food', headerTransparent: false }} />
            <Stack.Screen name="food/add" options={{ presentation: 'modal', title: 'Add food', headerTransparent: false }} />
            <Stack.Screen name="food/scan" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="food/custom" options={{ presentation: 'modal', title: 'Create food', headerTransparent: false }} />
            <Stack.Screen name="settings" options={{ title: 'Goals & settings', headerTransparent: false }} />
          </Stack.Protected>
        </Stack>
        <XpToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
