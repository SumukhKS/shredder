import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { toDay } from '@/lib/dates';
import { backfillHealth, connectHealth, healthStatus, openHealthSettings, type HealthStatus } from '@/lib/health';
import { startStepSensor, stopStepSensor } from '@/lib/step-sensor';
import { useAppSettings } from '@/stores/app-settings';
import { useSession } from '@/stores/session';

type Source = 'health_connect' | 'phone_sensor';

/** Settings > Integrations: where steps come from, and Health Connect for sleep. */
export default function IntegrationSettings() {
  const session = useSession((s) => s.session);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const source = useAppSettings((s) => s.stepsSource);
  const setStepsSource = useAppSettings((s) => s.setStepsSource);
  const [sourceNote, setSourceNote] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      healthStatus()
        .then(setHealth)
        .catch(() => setHealth('unsupported'));
    }, [])
  );

  async function changeSource(next: Source) {
    setSourceNote(null);
    if (next === 'phone_sensor') {
      const problem = await startStepSensor();
      if (problem) return setSourceNote(problem);
    } else {
      stopStepSensor();
    }
    setStepsSource(next);
  }

  async function connect() {
    setNote(null);
    const status = await connectHealth();
    setHealth(status);
    if (status === 'connected' && session) {
      await backfillHealth(session.user.id, toDay(), true);
      setNote('Connected. Steps and sleep sync each time you open Today.');
    } else if (status === 'disconnected') {
      setNote('Allow steps and sleep in Health Connect to sync them.');
    }
  }

  return (
    <Screen padTop={false}>
      <Card tone="flat" style={{ gap: Space.md }}>
        <AppText variant="bodyBold">Where steps come from</AppText>
        <Segmented<Source>
          options={[
            { key: 'health_connect', label: 'Health Connect' },
            { key: 'phone_sensor', label: 'Phone sensor' },
          ]}
          value={source}
          onChange={changeSource}
        />
        <AppText variant="small" color="textMuted">
          {source === 'phone_sensor'
            ? 'Shredder counts steps with the sensor in this phone, even when the app is closed. A "Tracking steps" notification stays on while it runs, and it uses a little more battery than Health Connect. Steps from before you turned it on stay as they were.'
            : 'Steps come from your watch or fitness app through Health Connect. Choose Phone sensor if you only carry your phone.'}
        </AppText>
        {sourceNote ? (
          <AppText variant="smallBold" color="danger">
            {sourceNote}
          </AppText>
        ) : null}
      </Card>
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
