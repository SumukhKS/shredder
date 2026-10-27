import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Space } from '@/constants/theme';

import { Sortable } from './sortable';
import { Button } from './ui/button';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

export interface ReorderItem {
  key: string;
  title: string;
  subtitle?: string;
}

/** Bottom sheet with a compact drag-and-drop list, for reordering things that are too tall to drag in place. */
export function ReorderSheet({
  visible,
  title,
  items,
  onReorder,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: ReorderItem[];
  onReorder: (keys: string[]) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Gestures inside an Android modal need their own root. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border, paddingBottom: insets.bottom + Space.lg }]}>
          <AppText variant="h3">{title}</AppText>
          <AppText variant="small" color="textMuted">
            Drag the handles to change the order.
          </AppText>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingVertical: Space.sm }}>
            <Sortable
              items={items}
              keyOf={itemKey}
              mode="handle"
              gap={Space.sm}
              onReorder={onReorder}
              renderItem={(it, { active, handle }) => (
                <View
                  style={[
                    styles.row,
                    { backgroundColor: active ? c.surfaceHi : c.bg, borderColor: active ? c.primary : c.hairline },
                  ]}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyBold" numberOfLines={1}>
                      {it.title}
                    </AppText>
                    {it.subtitle ? (
                      <AppText variant="small" color="textMuted" numberOfLines={1}>
                        {it.subtitle}
                      </AppText>
                    ) : null}
                  </View>
                  {handle}
                </View>
              )}
            />
          </ScrollView>
          <Button label="Done" onPress={onClose} />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const itemKey = (it: ReorderItem) => it.key;

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: Radius.hero,
    borderTopRightRadius: Radius.hero,
    borderWidth: 1,
    padding: Space.lg,
    gap: Space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingLeft: Space.lg,
    paddingRight: Space.xs,
    paddingVertical: Space.sm,
    borderRadius: Radius.row,
    borderWidth: 1,
  },
});
