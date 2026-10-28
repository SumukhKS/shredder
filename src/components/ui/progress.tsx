import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Radius, withAlpha } from '@/constants/theme';

import { useColors } from './theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const fill = { duration: 900, easing: Easing.out(Easing.cubic) };

/** Bar that sweeps to its value. */
export function ProgressBar({
  value,
  color,
  height = 12,
  track,
  outlined = false,
}: {
  value: number;
  color: string;
  height?: number;
  track?: string;
  outlined?: boolean;
}) {
  const c = useColors();
  const pct = Math.max(0, Math.min(1, value || 0));
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(pct, fill);
  }, [pct, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{
        height,
        borderRadius: Radius.chip,
        backgroundColor: track ?? c.hairline,
        overflow: 'hidden',
        borderWidth: outlined ? 2 : 0,
        borderColor: c.border,
      }}>
      <Animated.View style={[{ height: '100%', borderRadius: Radius.chip, backgroundColor: color }, style]} />
    </View>
  );
}

/** Ring that sweeps to its value. */
export function Ring({
  value,
  color,
  size = 72,
  stroke = 9,
  children,
}: {
  value: number;
  color: string;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const c = useColors();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const over = value > 1;
  const pct = Math.max(0, Math.min(1, value || 0));
  const swept = useSharedValue(0);
  useEffect(() => {
    swept.value = withTiming(pct, fill);
  }, [pct, swept]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - swept.value) }));
  const tint = over ? c.danger : color;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        {/* The empty track is a faint tint of the ring colour, so it reads on dark cards. */}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={withAlpha(tint, 0.18)} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tint}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          animatedProps={props}
        />
      </Svg>
      {children}
    </View>
  );
}
