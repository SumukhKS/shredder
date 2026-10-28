import { BricolageGrotesque_600SemiBold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { PlusJakartaSans_500Medium, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColors, useIsDark } from '@/components/ui/theme';
import { UpdateBanner } from '@/components/update-banner';
import { Fonts } from '@/constants/theme';
import { autoMergeExercises } from '@/lib/auto-merge';
import { useSession } from '@/stores/session';
import { useWorkout } from '@/stores/workout';

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

  // Once a day, fold custom exercises that are certainly library ones into the library. Not while a
  // workout is running, since it holds the custom exercise's id until it's saved.
  const userId = session?.user.id;
  const onboardedNow = !!profile?.onboarded;
  useEffect(() => {
    if (!userId || !onboardedNow || useWorkout.getState().active) return;
    autoMergeExercises(userId).catch(() => {});
  }, [userId, onboardedNow]);

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
          {/* Opened from the "Email confirmed" page; signs the new account in. */}
          <Stack.Screen name="auth-callback" options={{ headerShown: false }} />

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
            <Stack.Screen name="workout/day" options={{ title: 'Training', headerTransparent: false }} />
            <Stack.Screen name="workout/edit" options={{ title: 'Edit workout', headerTransparent: false }} />
            <Stack.Screen name="habit/[kind]" options={{ title: '', headerTransparent: false }} />
            <Stack.Screen name="streaks" options={{ title: 'Streaks', headerTransparent: false }} />
            <Stack.Screen name="calendar" options={{ title: 'Calendar', headerTransparent: false }} />
            <Stack.Screen
              name="workout/exercises"
              options={{ presentation: 'modal', title: 'Add exercises', headerTransparent: false }}
            />
            <Stack.Screen name="exercise/match" options={{ title: 'Match to library', headerTransparent: false }} />
            <Stack.Screen name="exercise/[id]" options={{ presentation: 'modal', title: 'Exercise', headerTransparent: false }} />
            <Stack.Screen name="routine/edit" options={{ title: 'Routine', headerTransparent: false }} />
            <Stack.Screen name="food/search" options={{ title: 'Log food', headerTransparent: false }} />
            <Stack.Screen name="food/add" options={{ presentation: 'modal', title: 'Add food', headerTransparent: false }} />
            <Stack.Screen name="food/scan" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen
              name="food/custom"
              options={{ presentation: 'modal', title: 'Create food', headerTransparent: false }}
            />
            <Stack.Screen name="settings" options={{ title: 'Goals & settings', headerTransparent: false }} />
            <Stack.Screen name="import" options={{ title: 'Import from Hevy', headerTransparent: false }} />
          </Stack.Protected>
        </Stack>
        <UpdateBanner />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
