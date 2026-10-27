import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { glow, Gradients, Radius } from '@/constants/theme';

import { useColors } from './theme';

/** Blaze-gradient square holding an icon; dims when `off`. */
export function IconTile({ icon, size = 32, off = false }: { icon: keyof typeof Ionicons.glyphMap; size?: number; off?: boolean }) {
  const c = useColors();
  return (
    <LinearGradient
      colors={off ? Gradients.char : Gradients.blaze}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        { width: size, height: size, borderRadius: Math.min(Radius.row, size / 3), alignItems: 'center', justifyContent: 'center' },
        off ? { borderWidth: 1, borderColor: c.border } : glow(c.glow, 12),
      ]}>
      <Ionicons name={icon} size={size * 0.55} color={off ? c.textMuted : c.onPrimary} />
    </LinearGradient>
  );
}
