import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useColors } from '@/components/ui/theme';
import { Radius } from '@/constants/theme';

// ExerciseDB's free tier: one animated GIF per exercise (180 × 180; sharper sizes are paid).
export const demoGif = (gifId: string) => `https://static.exercisedb.dev/media/${gifId}.gif`;

/**
 * How an exercise is done: its animated GIF. Pass `still` for thumbnails (the first frame) and
 * `round` for a circular icon. Exercises without a GIF (custom ones) show a barbell.
 */
export function ExerciseDemo({
  gifId,
  still = false,
  round = false,
  style,
}: {
  gifId?: string | null;
  still?: boolean;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const shape = { borderRadius: round ? 999 : Radius.row, overflow: 'hidden' as const };

  if (!gifId) {
    return (
      <View style={[shape, { backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Ionicons name="barbell-outline" size={22} color={c.primary} />
      </View>
    );
  }
  return (
    // The GIFs are drawn on white, so give them a white frame in dark mode too.
    <View style={[shape, { backgroundColor: '#FFFFFF' }, style]}>
      <Image
        source={demoGif(gifId)}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        autoplay={!still}
        cachePolicy="memory-disk"
        accessibilityLabel="Exercise demonstration"
      />
    </View>
  );
}
