import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { usePicker } from '@/stores/picker';

/** Move and pinch a photo inside the circle. The result goes back to the profile editor through the picker store. */
export default function CropPhoto() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screen } = useWindowDimensions();
  const params = useLocalSearchParams<{ uri: string; width: string; height: string }>();
  const w = Number(params.width);
  const h = Number(params.height);
  const frame = screen - Space.lg * 2;
  const fit = frame / Math.min(w, h);

  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the photo covering the whole frame.
  const clampX = (v: number, s: number) => {
    'worklet';
    const room = Math.max(0, (w * fit * s - frame) / 2);
    return Math.max(-room, Math.min(room, v));
  };
  const clampY = (v: number, s: number) => {
    'worklet';
    const room = Math.max(0, (h * fit * s - frame) / 2);
    return Math.max(-room, Math.min(room, v));
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.set(x.get());
      startY.set(y.get());
    })
    .onUpdate((e) => {
      x.set(clampX(startX.get() + e.translationX, scale.get()));
      y.set(clampY(startY.get() + e.translationY, scale.get()));
    });
  const pinch = Gesture.Pinch()
    .onBegin(() => startScale.set(scale.get()))
    .onUpdate((e) => {
      const s = Math.max(1, Math.min(5, startScale.get() * e.scale));
      scale.set(s);
      x.set(clampX(x.get(), s));
      y.set(clampY(y.get(), s));
    });

  const photo = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  async function done() {
    setBusy(true);
    setError(null);
    try {
      const k = fit * scale.get();
      const size = Math.min(frame / k, w, h);
      const originX = Math.max(0, Math.min(w - size, w / 2 - x.get() / k - size / 2));
      const originY = Math.max(0, Math.min(h - size, h / 2 - y.get() / k - size / 2));
      const context = ImageManipulator.manipulate(params.uri);
      context.crop({
        originX: Math.round(originX),
        originY: Math.round(originY),
        width: Math.floor(size),
        height: Math.floor(size),
      });
      context.resize({ width: 512, height: 512 });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      usePicker.getState().setCropped(saved.uri);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not crop that photo.');
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + Space.lg, paddingBottom: insets.bottom + Space.lg }}>
      <View style={{ paddingHorizontal: Space.lg, gap: Space.xs }}>
        <AppText variant="h2">Move and scale</AppText>
        <AppText variant="small" color="textMuted">
          Drag to move, pinch to zoom. The circle is what people see.
        </AppText>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
          <View style={{ width: frame, height: frame, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={[{ width: w * fit, height: h * fit }, photo]}>
              <Image source={{ uri: params.uri }} style={{ flex: 1 }} contentFit="cover" />
            </Animated.View>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: frame,
                height: frame,
                borderRadius: frame / 2,
                borderWidth: 2,
                borderColor: c.primary,
              }}
            />
          </View>
        </GestureDetector>
      </View>
      {error ? (
        <AppText variant="smallBold" color="danger" align="center">
          {error}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', gap: Space.md, paddingHorizontal: Space.lg, paddingTop: Space.md }}>
        <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => router.back()} style={{ flex: 1 }} />
        <Button label="Done" icon="checkmark" loading={busy} onPress={done} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
