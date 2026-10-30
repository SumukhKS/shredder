import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chips';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { guessColumns, type ColumnMap, type CsvField } from '@/lib/csv-import';

/** Match a CSV's columns to our fields and see the result before anything is saved. */
export function ColumnSheet({
  title,
  header,
  fields,
  preview,
  options,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  header: string[];
  fields: CsvField[];
  /** What would be imported with these columns, one line each. */
  preview: (map: ColumnMap) => string[];
  /** Unit choices. */
  options?: React.ReactNode;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (map: ColumnMap) => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [map, setMap] = useState<ColumnMap>(() => guessColumns(header, fields));
  const ready = fields.every((f) => !f.required || map[f.key] != null);
  const lines = ready ? preview(map) : [];

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + Space.lg }}>
        <View style={{ paddingHorizontal: Space.lg, gap: Space.xs }}>
          <AppText variant="h2">{title}</AppText>
          <AppText variant="small" color="textMuted">
            Check which column holds what. Nothing is saved until you import.
          </AppText>
        </View>
        <ScrollView contentContainerStyle={{ padding: Space.lg, gap: Space.lg }}>
          {options}
          {fields.map((f) => (
            <View key={f.key} style={{ gap: Space.xs }}>
              <AppText variant="smallBold" color="textMuted">
                {f.label}
                {f.required ? ' (needed)' : ''}
              </AppText>
              <ChipRow>
                {f.required ? null : (
                  <Chip
                    label="None"
                    selected={map[f.key] == null}
                    onPress={() => setMap((m) => ({ ...m, [f.key]: undefined }))}
                  />
                )}
                {header.map((h, i) => (
                  <Chip
                    key={`${h}-${i}`}
                    label={h.trim() || `Column ${i + 1}`}
                    selected={map[f.key] === i}
                    onPress={() => setMap((m) => ({ ...m, [f.key]: i }))}
                  />
                ))}
              </ChipRow>
            </View>
          ))}
          <Card tone="flat" style={{ gap: Space.xs }}>
            <AppText variant="bodyBold">Preview</AppText>
            {ready ? (
              lines.map((l, i) => (
                <AppText key={i} variant="small" color="textMuted">
                  {l}
                </AppText>
              ))
            ) : (
              <AppText variant="small" color="textMuted">
                Choose the columns marked as needed.
              </AppText>
            )}
          </Card>
          {error ? (
            <AppText variant="smallBold" color="danger">
              {error}
            </AppText>
          ) : null}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: Space.sm, padding: Space.lg, paddingBottom: insets.bottom + Space.lg }}>
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} style={{ flex: 1 }} />
          <Button label="Import" loading={busy} disabled={!ready} onPress={() => onConfirm(map)} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}
