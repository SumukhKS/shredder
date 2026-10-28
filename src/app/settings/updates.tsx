import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useState } from 'react';

import { ToggleRow } from '@/components/settings-row';
import { checkForAppUpdate } from '@/components/update-banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { useAppSettings } from '@/stores/app-settings';

/** Settings > App updates: auto-update on or off, and a manual check. */
export default function UpdateSettings() {
  const { autoUpdate, setAutoUpdate } = useAppSettings();
  const [note, setNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    setNote(null);
    try {
      const r = await checkForAppUpdate();
      if (r === 'available') {
        setNote('Downloading the new version...');
        await Updates.fetchUpdateAsync();
        setNote('Downloaded. Tap Update ready to restart into it.');
      } else {
        setNote(r === 'none' ? 'You have the latest version.' : 'Updates are off in development builds.');
      }
    } catch {
      setNote('Could not reach the update server. Check your connection.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen padTop={false}>
      <ToggleRow
        title="Auto-update"
        detail={
          autoUpdate
            ? 'New versions download by themselves; you choose when to restart into them.'
            : 'You are asked before anything is downloaded.'
        }
        value={autoUpdate}
        onChange={setAutoUpdate}
      />
      <Card tone="flat" style={{ gap: Space.md }}>
        <AppText variant="small" color="textMuted">
          Version {Constants.expoConfig?.version ?? '1.0.0'}
          {Updates.updateId ? `, update ${Updates.updateId.slice(0, 8)}` : ', as installed'}
          {Updates.createdAt ? ` from ${Updates.createdAt.toLocaleDateString()}` : ''}.
        </AppText>
        <Button label="Check for updates" icon="cloud-download-outline" variant="secondary" loading={checking} onPress={check} />
        {note ? (
          <AppText variant="small" color="textMuted">
            {note}
          </AppText>
        ) : null}
      </Card>
    </Screen>
  );
}
