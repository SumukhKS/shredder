import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Space } from '@/constants/theme';

import { Button } from './ui/button';
import { Field } from './ui/field';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

interface NumberSheetProps {
  visible: boolean;
  title: string;
  hint?: string;
  suffix?: string;
  initial?: string;
  decimal?: boolean;
  /** Quick-add chips that add to the number in the field, e.g. +0.25 L. */
  quick?: { label: string; add: number }[];
  /** Extra content under the save button (e.g. a sync action). */
  footer?: React.ReactNode;
  onClose: () => void;
  onSave: (value: number) => Promise<void> | void;
}

/** Bottom sheet with a single numeric input, for steps / sleep / weight entries. */
export function NumberSheet({ visible, onClose, ...rest }: NumberSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Body mounts fresh each time the sheet opens, so its input starts from `initial`. */}
      {visible ? <SheetBody onClose={onClose} {...rest} /> : null}
    </Modal>
  );
}

function SheetBody({ title, hint, suffix, initial, decimal, quick, footer, onClose, onSave }: Omit<NumberSheetProps, 'visible'>) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(value.replace(',', '.'));
    if (value.trim() === '' || !Number.isFinite(n) || n < 0) return setError('Enter a number.');
    setSaving(true);
    try {
      await onSave(n);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border, paddingBottom: insets.bottom + Space.lg }]}>
        <AppText variant="h2">{title}</AppText>
        <Field
          autoFocus
          value={value}
          onChangeText={setValue}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          suffix={suffix}
          hint={hint}
          error={error}
          onSubmitEditing={save}
        />
        {quick?.length ? (
          <View style={styles.quick}>
            {quick.map((q) => (
              <Pressable
                key={q.label}
                accessibilityRole="button"
                accessibilityLabel={`Add ${q.label}`}
                onPress={() => {
                  const n = Number(value.replace(',', '.')) || 0;
                  setValue(String(Math.round((n + q.add) * 100) / 100));
                  setError(null);
                }}
                style={({ pressed }) => [styles.chip, { borderColor: c.border, backgroundColor: pressed ? c.primarySoft : c.bg }]}>
                <AppText variant="smallBold">{q.label}</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Button label="Save" size="lg" loading={saving} onPress={save} />
        {footer}
      </View>
    </KeyboardAvoidingView>
  );
}

interface TextSheetProps {
  visible: boolean;
  title: string;
  initial?: string;
  placeholder?: string;
  onClose: () => void;
  onSave: (value: string) => Promise<void> | void;
}

/** Bottom sheet with a single text input, for renaming things. */
export function TextSheet({ visible, onClose, ...rest }: TextSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? <TextSheetBody onClose={onClose} {...rest} /> : null}
    </Modal>
  );
}

function TextSheetBody({ title, initial, placeholder, onClose, onSave }: Omit<TextSheetProps, 'visible'>) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!value.trim()) return setError('Enter a name.');
    setSaving(true);
    try {
      await onSave(value.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border, paddingBottom: insets.bottom + Space.lg }]}>
        <AppText variant="h2">{title}</AppText>
        <Field
          autoFocus
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          error={error}
          selectTextOnFocus
          onSubmitEditing={save}
        />
        <Button label="Save" size="lg" loading={saving} onPress={save} />
      </View>
    </KeyboardAvoidingView>
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
  quick: { flexDirection: 'row', gap: Space.sm },
  chip: { flex: 1, height: 40, borderRadius: Radius.row, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
