import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Space } from '@/constants/theme';

import { AppText } from './ui/text';
import { useColors } from './ui/theme';

export interface MenuOption {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  selected?: boolean;
  onPress: () => void;
}

/** Cross-platform action sheet (Android alerts cap at three buttons). */
export function MenuSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  options: MenuOption[];
  onClose: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border, paddingBottom: insets.bottom + Space.lg }]}>
        {title ? (
          <AppText variant="h3" style={{ marginBottom: Space.sm }}>
            {title}
          </AppText>
        ) : null}
        {options.map((o) => (
          <Pressable
            key={o.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              o.onPress();
            }}
            style={({ pressed }) => [styles.item, { backgroundColor: pressed ? c.primarySoft : 'transparent' }]}>
            {o.icon ? <Ionicons name={o.icon} size={20} color={o.destructive ? c.danger : c.text} /> : null}
            <AppText variant="bodyBold" color={o.destructive ? 'danger' : 'text'} style={{ flex: 1 }}>
              {o.label}
            </AppText>
            {o.selected ? <Ionicons name="checkmark" size={20} color={c.primary} /> : null}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    borderTopLeftRadius: Radius.hero,
    borderTopRightRadius: Radius.hero,
    borderWidth: 2,
    borderBottomWidth: 0,
    padding: Space.lg,
    gap: 2,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingHorizontal: Space.md, height: 50, borderRadius: Radius.row },
});
