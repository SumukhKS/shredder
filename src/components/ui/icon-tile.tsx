import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Radius } from '@/constants/theme';

import { useColors } from './theme';

/** Orange square holding an icon; dims when `off`. */
export function IconTile({ icon, size = 32, off = false }: { icon: keyof typeof Ionicons.glyphMap; size?: number; off?: boolean }) {
  const c = useColors();
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: Math.min(Radius.row, size / 3), alignItems: 'center', justifyContent: 'center' },
        off ? { backgroundColor: c.surfaceHi, borderWidth: 1, borderColor: c.border } : { backgroundColor: c.primary },
      ]}>
      <Ionicons name={icon} size={size * 0.55} color={off ? c.textMuted : c.onPrimary} />
    </View>
  );
}
