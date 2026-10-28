import Constants from 'expo-constants';
import { router } from 'expo-router';
import { View } from 'react-native';

import { SettingsRow } from '@/components/settings-row';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { useUnits } from '@/lib/units';
import { useAppSettings } from '@/stores/app-settings';
import { useSession } from '@/stores/session';

/** Settings, opened from the Profile tab: one row per section. */
export default function Settings() {
  const session = useSession((s) => s.session);
  const units = useUnits();
  const autoUpdate = useAppSettings((s) => s.autoUpdate);
  return (
    <Screen padTop={false}>
      <View style={{ gap: Space.sm }}>
        <SettingsRow
          icon="person-outline"
          title="Profile"
          detail="Body details, calorie and macro goals, daily habits"
          onPress={() => router.push('/settings/profile')}
        />
        <SettingsRow
          icon="key-outline"
          title="Account"
          detail={session?.user.email ?? 'Email, password, sign out'}
          onPress={() => router.push('/settings/account')}
        />
        <SettingsRow
          icon="notifications-outline"
          title="Notifications"
          detail="Reminders to train, eat, drink and weigh in"
          onPress={() => router.push('/settings/notifications')}
        />
        <SettingsRow
          icon="calculator-outline"
          title="Calculators"
          detail="Calories, macros, body fat, BMI, BMR, one-rep max"
          onPress={() => router.push('/settings/calculators')}
        />
        <SettingsRow
          icon="speedometer-outline"
          title="Units"
          detail={`${units.weight === 'kg' ? 'Kilograms' : 'Pounds'}, ${units.length === 'cm' ? 'centimetres' : 'inches'}`}
          onPress={() => router.push('/settings/units')}
        />
        <SettingsRow
          icon="watch-outline"
          title="Integrations"
          detail="Health Connect: steps and sleep from your watch or phone"
          onPress={() => router.push('/settings/integrations')}
        />
        <SettingsRow
          icon="swap-vertical-outline"
          title="Import or export data"
          detail="Import from Hevy, match exercises, export everything"
          onPress={() => router.push('/settings/data')}
        />
        <SettingsRow icon="help-circle-outline" title="FAQ" onPress={() => router.push('/settings/faq')} />
        <SettingsRow
          icon="cloud-download-outline"
          title="App updates"
          detail={autoUpdate ? 'Auto-update on' : 'Ask before updating'}
          onPress={() => router.push('/settings/updates')}
        />
      </View>
      <AppText variant="small" color="textMuted" align="center">
        Shredder {Constants.expoConfig?.version ?? '1.0.0'}
      </AppText>
    </Screen>
  );
}
