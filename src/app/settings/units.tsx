import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { useAppSettings } from '@/stores/app-settings';

/** Settings > Units. Everything is stored in kg and cm; this only changes what's shown and typed. */
export default function UnitSettings() {
  const { weightUnit, lengthUnit, setUnits } = useAppSettings();
  return (
    <Screen padTop={false}>
      <Card tone="flat" style={{ gap: Space.md }}>
        <AppText variant="bodyBold">Weight</AppText>
        <Segmented<'kg' | 'lb'>
          options={[
            { key: 'kg', label: 'Kilograms (kg)' },
            { key: 'lb', label: 'Pounds (lb)' },
          ]}
          value={weightUnit}
          onChange={(v) => setUnits({ weightUnit: v })}
        />
        <AppText variant="bodyBold">Height and measurements</AppText>
        <Segmented<'cm' | 'in'>
          options={[
            { key: 'cm', label: 'Centimetres (cm)' },
            { key: 'in', label: 'Inches (in)' },
          ]}
          value={lengthUnit}
          onChange={(v) => setUnits({ lengthUnit: v })}
        />
        <AppText variant="small" color="textMuted">
          Used for lifts, volume, PRs, body weight and measurements. A workout in progress keeps the unit it started with.
        </AppText>
      </Card>
    </Screen>
  );
}
