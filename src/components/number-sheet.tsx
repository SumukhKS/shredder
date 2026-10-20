import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
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

function SheetBody({ title, hint, suffix, initial, decimal, onClose, onSave }: Omit<NumberSheetProps, 'visible'>) {
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
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
        <Button label="Save" size="lg" loading={saving} onPress={save} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(20,17,41,0.45)' },
  sheet: {
    borderTopLeftRadius: Radius.hero,
    borderTopRightRadius: Radius.hero,
    borderWidth: 2,
    borderBottomWidth: 0,
    padding: Space.xl,
    gap: Space.lg,
  },
});
