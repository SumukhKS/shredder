import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space } from '@/constants/theme';
import { lookupBarcode } from '@/lib/foods';

export default function ScanBarcode() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ day?: string; meal?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [looking, setLooking] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const lock = useRef(false);

  async function handle(code: string) {
    if (lock.current) return;
    lock.current = true;
    setLooking(true);
    setNotFound(null);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const food = await lookupBarcode(code);
    setLooking(false);
    if (food) {
      router.replace({ pathname: '/food/add', params: { food: JSON.stringify(food), ...params } });
    } else {
      setNotFound(code);
      setTimeout(() => (lock.current = false), 1500);
    }
  }

  const close = <IconButton icon="close" label="Close scanner" color="#FFFFFF" size={28} onPress={() => router.back()} />;

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <AppText variant="h2" align="center">
          Scan packaged food
        </AppText>
        <AppText color="textMuted" align="center">
          Shredder needs the camera to read barcodes. Photos are never saved.
        </AppText>
        <Button label="Allow camera" onPress={requestPermission} />
        <Button label="Not now" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={({ data }) => handle(data)}
      />
      <View style={[styles.overlay, { paddingTop: insets.top + Space.sm, paddingBottom: insets.bottom + Space.lg }]}>
        <View style={styles.topRow}>{close}</View>
        <View style={[styles.frame, { borderColor: notFound ? c.danger : '#FFFFFF' }]}>
          {looking ? <ActivityIndicator color="#FFFFFF" size="large" /> : null}
        </View>
        <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }]}>
          {notFound ? (
            <>
              <AppText variant="bodyBold">No match for {notFound}.</AppText>
              <AppText variant="small" color="textMuted">
                Add it once and it is saved for everyone who scans it next.
              </AppText>
              <Button
                label="Create this food"
                variant="secondary"
                onPress={() => router.replace({ pathname: '/food/custom', params: { barcode: notFound, ...params } })}
              />
            </>
          ) : (
            <>
              <AppText variant="bodyBold">Point at the barcode on the pack</AppText>
              <Field
                value={manual}
                onChangeText={setManual}
                placeholder="Or type the barcode number"
                keyboardType="number-pad"
                onSubmitEditing={() => manual.length >= 8 && handle(manual)}
              />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: Space.xl, gap: Space.lg, justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'space-between', paddingHorizontal: Space.lg },
  topRow: { flexDirection: 'row' },
  frame: {
    alignSelf: 'center',
    width: 260,
    height: 160,
    borderWidth: 3,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: { borderWidth: 2, borderRadius: Radius.card, padding: Space.lg, gap: Space.md },
});
