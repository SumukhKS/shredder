import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Space } from '@/constants/theme';

import { Button } from './button';
import { AppText } from './text';
import { useColors } from './theme';
import { WheelPicker } from './wheel-picker';

export interface WheelColumn {
  label: string;
  values: number[];
  value: number;
  format?: (v: number) => string;
  /** Text under the wheel, e.g. a unit. */
  suffix?: string;
}

/** Bottom sheet with one or more wheels side by side. */
export function WheelSheet({
  visible,
  onClose,
  ...rest
}: {
  visible: boolean;
  title: string;
  columns: WheelColumn[];
  onClose: () => void;
  onSave: (values: number[]) => void;
  /** Adds a Clear button, for fields that may be left empty. */
  onClear?: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Mounts fresh each time, so the wheels start from the current values. */}
      {visible ? <SheetBody onClose={onClose} {...rest} /> : null}
    </Modal>
  );
}

function SheetBody({
  title,
  columns,
  onClose,
  onSave,
  onClear,
}: {
  title: string;
  columns: WheelColumn[];
  onClose: () => void;
  onSave: (values: number[]) => void;
  onClear?: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [chosen, setChosen] = useState(() => columns.map((col) => col.value));

  return (
    <View style={{ flex: 1 }}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border, paddingBottom: insets.bottom + Space.lg }]}>
        <AppText variant="h2">{title}</AppText>
        <View style={styles.wheels}>
          {columns.map((col, i) => (
            <View key={col.label} style={{ alignItems: 'center', gap: Space.xs }}>
              <WheelPicker
                label={col.label}
                values={col.values}
                value={col.value}
                format={col.format}
                onChange={(v) => setChosen((all) => all.map((old, j) => (j === i ? v : old)))}
              />
              {col.suffix ? (
                <AppText variant="smallBold" color="textMuted">
                  {col.suffix}
                </AppText>
              ) : null}
            </View>
          ))}
        </View>
        <Button
          label="Done"
          size="lg"
          onPress={() => {
            onSave(chosen);
            onClose();
          }}
        />
        {onClear ? (
          <Button
            label="Clear"
            variant="ghost"
            onPress={() => {
              onClear();
              onClose();
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Looks like a form field; a tap opens whatever edits it. */
export function PickerBox({
  label,
  value,
  placeholder,
  suffix,
  hint,
  onPress,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  suffix?: string;
  hint?: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: Space.xs }}>
      {label ? (
        <AppText variant="smallBold" color="textMuted" numberOfLines={1}>
          {label}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Value'}: ${value || 'not set'}${suffix ? ` ${suffix}` : ''}. Tap to change`}
        onPress={onPress}
        style={({ pressed }) => [styles.box, { backgroundColor: pressed ? c.surfaceHi : c.surface, borderColor: c.border }]}>
        <AppText variant="body" color={value ? 'text' : 'textMuted'} style={{ flex: 1 }} numberOfLines={1}>
          {value || placeholder || 'Set'}
        </AppText>
        {suffix ? (
          <AppText variant="smallBold" color="textMuted">
            {suffix}
          </AppText>
        ) : null}
        <Ionicons name="chevron-expand" size={16} color={c.textMuted} />
      </Pressable>
      {hint ? (
        <AppText variant="small" color="textMuted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/** Every step from min to max; a saved value between the steps gets its own row, so it isn't changed by opening the wheel. */
export function wheelValues(min: number, max: number, step: number, current?: number): number[] {
  const count = Math.round((max - min) / step);
  const out = Array.from({ length: count + 1 }, (_, i) => Math.round((min + i * step) * 100) / 100);
  if (current !== undefined && !out.includes(current)) {
    out.push(current);
    out.sort((a, b) => a - b);
  }
  return out;
}

/** A number chosen on a wheel. Keeps the same text value a typed field would, so forms don't change. */
export function WheelField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  start,
  suffix,
  hint,
  clearable,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  /** Where the wheel opens when nothing is set yet. */
  start?: number;
  suffix?: string;
  hint?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const parsed = Number(value.replace(',', '.'));
  const current = value.trim() !== '' && Number.isFinite(parsed) ? parsed : undefined;
  return (
    <>
      <PickerBox label={label} value={value} suffix={suffix} hint={hint} onPress={() => setOpen(true)} />
      <WheelSheet
        visible={open}
        title={label}
        onClose={() => setOpen(false)}
        columns={[
          {
            label,
            values: open ? wheelValues(min, max, step, current) : [],
            value: current ?? start ?? min,
            format: (v) => v.toLocaleString(),
            suffix,
          },
        ]}
        onSave={([v]) => onChange(String(v))}
        onClear={clearable && current !== undefined ? () => onChange('') : undefined}
      />
    </>
  );
}

const twoDigits = (n: number) => String(n).padStart(2, '0');
const HOURS = wheelValues(0, 23, 1);
const SIXTY = wheelValues(0, 59, 1);

/** Hours, minutes and seconds on wheels; for how long a workout took. */
export function TimeSheet({
  visible,
  title = 'Time',
  seconds,
  onClose,
  onSave,
}: {
  visible: boolean;
  title?: string;
  seconds: number;
  onClose: () => void;
  onSave: (seconds: number) => void;
}) {
  const total = Math.max(0, Math.floor(seconds));
  return (
    <WheelSheet
      visible={visible}
      title={title}
      onClose={onClose}
      columns={[
        { label: 'Hours', values: HOURS, value: Math.min(23, Math.floor(total / 3600)), suffix: 'hr' },
        { label: 'Minutes', values: SIXTY, value: Math.floor((total % 3600) / 60), format: twoDigits, suffix: 'min' },
        { label: 'Seconds', values: SIXTY, value: total % 60, format: twoDigits, suffix: 'sec' },
      ]}
      onSave={([h, m, s]) => onSave(h * 3600 + m * 60 + s)}
    />
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    borderTopLeftRadius: Radius.hero,
    borderTopRightRadius: Radius.hero,
    borderWidth: 2,
    borderBottomWidth: 0,
    padding: Space.xl,
    gap: Space.lg,
  },
  wheels: { flexDirection: 'row', justifyContent: 'center', gap: Space.md },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: Radius.row,
    paddingHorizontal: Space.md,
    minHeight: 50,
    gap: Space.xs,
  },
});
