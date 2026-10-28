import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { toDay } from '@/lib/dates';
import { backfillHealth, connectHealth, healthStatus, openHealthSettings, type HealthStatus } from '@/lib/health';
import { useSession } from '@/stores/session';

/** Settings > Integrations: Health Connect, where steps and sleep come from. */
export default function IntegrationSettings() {
  const session = useSession((s) => s.session);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      healthStatus()
        .then(setHealth)
        .catch(() => setHealth('unsupported'));
    }, [])
  );

  async function connect() {
    setNote(null);
    const status = await connectHealth();
    setHealth(status);
    if (status === 'connected' && session) {
      await backfillHealth(session.user.id, toDay());
      setNote('Connected. Steps and sleep sync each time you open Today.');
    } else if (status === 'disconnected') {
      setNote('Allow steps and sleep in Health Connect to sync them.');
    }
  }

  return (
    <Screen padTop={false}>
      <Card tone="flat" style={{ gap: Space.md }}>
        <AppText variant="bodyBold">Health Connect</AppText>
        <AppText variant="small" color="textMuted">
          Steps and sleep come from Health Connect, the shared health store on Android. Fitbit, Samsung Health, Google Fit,
          Garmin, Mi Fitness and most smartwatches can write to it: turn on Health Connect sync in that app once.
        </AppText>
        <AppText variant="bodyBold" color="primary">
          {HEALTH_LABELS[health ?? 'checking']}
        </AppText>
        {health === 'disconnected' ? <Button label="Connect" icon="watch-outline" variant="secondary" onPress={connect} /> : null}
        {health === 'connected' ? (
          <Button label="Choose which apps share data" icon="options-outline" variant="secondary" onPress={openHealthSettings} />
        ) : null}
        {health === 'not_installed' || health === 'needs_update' ? (
          <AppText variant="small" color="textMuted">
            Get Health Connect from the Play Store, then come back here.
          </AppText>
        ) : null}
        {note ? (
          <AppText variant="small" color="textMuted">
            {note}
          </AppText>
        ) : null}
      </Card>
    </Screen>
  );
}

const HEALTH_LABELS: Record<HealthStatus | 'checking', string> = {
  connected: 'Connected',
  disconnected: 'Not connected',
  not_installed: 'Health Connect is not installed',
  needs_update: 'Health Connect needs an update',
  unsupported: 'Available on Android phones',
  checking: 'Checking...',
};
