import { useState } from 'react';
import { FlatList, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Radius } from '@/constants/theme';

import { AppText } from './text';
import { useColors } from './theme';

const ROW = 44;
const VISIBLE = 5;

/** Scrolling wheel: the row in the middle band is the chosen one. */
export function WheelPicker({
  values,
  value,
  onChange,
  label,
  format = String,
}: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}) {
  const c = useColors();
  const [centre, setCentre] = useState(() => Math.max(0, values.indexOf(value)));
  const indexAt = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    Math.max(0, Math.min(values.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW)));
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => onChange(values[indexAt(e)]);
  const gap = (ROW * (VISIBLE - 1)) / 2;

  return (
    <View accessibilityLabel={label} style={{ height: ROW * VISIBLE, width: 84 }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: gap,
          left: 0,
          right: 0,
          height: ROW,
          borderRadius: Radius.row,
          backgroundColor: c.surfaceHi,
        }}
      />
      <FlatList
        data={values}
        keyExtractor={String}
        initialScrollIndex={centre}
        getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
        snapToInterval={ROW}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: gap }}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const i = indexAt(e);
          if (i !== centre) setCentre(i);
        }}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        renderItem={({ item, index }) => (
          <View style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant={index === centre ? 'h3' : 'body'} color={index === centre ? 'text' : 'textMuted'}>
              {format(item)}
            </AppText>
          </View>
        )}
      />
    </View>
  );
}
