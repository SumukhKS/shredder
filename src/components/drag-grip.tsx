import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { useColors } from './ui/theme';

/** The grip people press and drag to move an item in a `Sortable` list. */
export function DragGrip() {
  const c = useColors();
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Drag to reorder"
      hitSlop={8}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="reorder-three" size={26} color={c.textMuted} />
    </View>
  );
}
