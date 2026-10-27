import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Fonts, Radius, Space } from '@/constants/theme';

import { PrBadge } from './pr-badge';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)] as const;
}

/** Clean axis ticks (1, 2, 2.5 or 5 × a power of ten) covering lo..hi, about `count` of them. */
function niceTicks(lo: number, hi: number, count = 5): number[] {
  const raw = (hi - lo) / count || 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let t = start; t <= hi + step * 0.001; t += step) out.push(Math.round(t * 1000) / 1000);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

/** Smooth curve through the points that never overshoots them (monotone cubic). */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0].x},${pts[0].y}` : '';
  const n = pts.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1));
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  m.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i].x + h},${pts[i].y + m[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - m[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

/** Full numbers, never shortened: 12,450 and 72.5, not 12.5K. */
const fullNumber = (v: number) => (Math.round(v * 10) / 10).toLocaleString();

/**
 * Line chart for one series: a smooth line over a soft wash, hairline gridlines at clean numbers,
 * and the latest point marked. It draws itself in, and touching it shows the value under the finger.
 */
export function LineChart({
  values,
  labels,
  color,
  height = 230,
  unit = '',
  marks,
  format = fullNumber,
}: {
  values: number[];
  labels: string[];
  color: string;
  height?: number;
  unit?: string;
  /** Points to mark (e.g. sessions that set a personal record); the readout names them. */
  marks?: boolean[];
  format?: (v: number) => string;
}) {
  const c = useColors();
  const [width, onLayout] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const draw = useSharedValue(0);
  const shape = values.join(',');

  useEffect(() => {
    draw.value = 0;
    draw.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [shape, width, draw]);

  // The top band holds the readout, so it never covers the line.
  const pad = { l: 44, r: 14, t: 58, b: 24 };
  const iw = Math.max(1, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max - min || Math.max(1, Math.abs(max) * 0.1);
  const ticks = niceTicks(min - span * 0.1, max + span * 0.1);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const x = (i: number) => pad.l + (values.length === 1 ? iw / 2 : (i / (values.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const pts = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const line = smoothPath(pts);
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1].x},${pad.t + ih} L${pts[0].x},${pad.t + ih} Z` : '';
  // Long enough to cover the curve; the dash trick draws the line in from the left.
  const length = pts.reduce((t, p, i) => (i ? t + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) * 1.2 + 10;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.value) }));
  const areaProps = useAnimatedProps(() => ({ opacity: draw.value }));

  const last = values.length - 1;
  const xLabels = values.length > 2 ? [0, Math.floor(last / 2), last] : values.map((_, i) => i);

  const pick = (px: number) => {
    if (!values.length) return;
    const i = values.length === 1 ? 0 : Math.round(((px - pad.l) / iw) * (values.length - 1));
    setActive(Math.max(0, Math.min(last, i)));
  };
  // Sideways drag scrubs along the line; up and down still scrolls the page.
  const scrub = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onBegin((e) => scheduleOnRN(pick, e.x))
    .onUpdate((e) => scheduleOnRN(pick, e.x))
    .onFinalize(() => scheduleOnRN(setActive, null));
  const tap = Gesture.Tap()
    .maxDuration(10_000)
    .onBegin((e) => scheduleOnRN(pick, e.x))
    .onFinalize(() => scheduleOnRN(setActive, null));
  const gesture = Gesture.Race(scrub, tap);

  if (values.length === 0) return <View style={{ height }} onLayout={onLayout} />;
  const shown = active ?? last;
  const tipW = 132;
  const tipX = Math.max(0, Math.min(width - tipW, x(shown) - tipW / 2));
  const id = `wash-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <GestureDetector gesture={gesture}>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {ticks.map((t) => (
              <Line key={t} x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={c.hairline} strokeWidth={1} />
            ))}
            {ticks.map((t) => (
              <SvgText
                key={`l${t}`}
                x={pad.l - 8}
                y={y(t) + 4}
                fontSize={10}
                fill={c.textMuted}
                textAnchor="end"
                fontFamily={Fonts.body}>
                {fullNumber(t)}
              </SvgText>
            ))}
            {area ? <AnimatedPath d={area} fill={`url(#${id})`} animatedProps={areaProps} /> : null}
            <AnimatedPath
              d={line}
              stroke={color}
              strokeWidth={2.5}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={[length, length]}
              animatedProps={lineProps}
            />
            {marks?.map((m, i) =>
              m && i !== shown ? (
                <Circle key={`m${i}`} cx={x(i)} cy={y(values[i])} r={4} fill={color} stroke={c.surface} strokeWidth={2} />
              ) : null
            )}
            {active != null ? (
              <Line
                x1={x(shown)}
                x2={x(shown)}
                y1={pad.t}
                y2={pad.t + ih}
                stroke={c.textMuted}
                strokeOpacity={0.5}
                strokeWidth={1}
              />
            ) : null}
            <Circle cx={x(shown)} cy={y(values[shown])} r={9} fill={color} fillOpacity={0.22} />
            <Circle cx={x(shown)} cy={y(values[shown])} r={5} fill={color} stroke={c.surface} strokeWidth={2} />
            {xLabels.map((i, k) => (
              <SvgText
                key={`x${i}`}
                x={x(i)}
                y={height - 6}
                fontSize={10}
                fill={c.textMuted}
                textAnchor={
                  k === 0 && xLabels.length > 1 ? 'start' : k === xLabels.length - 1 && xLabels.length > 1 ? 'end' : 'middle'
                }
                fontFamily={Fonts.body}>
                {labels[i]}
              </SvgText>
            ))}
            {/* Keeps the touch area solid across the whole plot. */}
            <Rect x={0} y={0} width={width} height={height} fill="transparent" />
          </Svg>
        ) : null}
        {width > 0 ? (
          <View
            pointerEvents="none"
            style={[tipStyles.tip, { left: tipX, width: tipW, backgroundColor: c.surfaceHi, borderColor: c.hairline }]}>
            <AppText variant="small" color="textMuted" numberOfLines={1}>
              {active == null ? 'Latest' : labels[shown]}
            </AppText>
            <View style={tipStyles.tipRow}>
              <AppText variant="bodyBold" numberOfLines={1}>
                {format(values[shown])}
                {unit}
              </AppText>
              {marks?.[shown] ? <PrBadge size={16} label="PR session" /> : null}
            </View>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const tipStyles = StyleSheet.create({
  tip: {
    position: 'absolute',
    top: 0,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: Radius.row,
    borderWidth: 1,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

/** Minimal bar chart with labels under each bar; the last bar (or every bar) is in colour. */
export function BarChart({
  values,
  labels,
  color,
  height = 150,
  colorAll = false,
}: {
  values: number[];
  labels: string[];
  color: string;
  height?: number;
  colorAll?: boolean;
}) {
  const c = useColors();
  const [width, onLayout] = useWidth();
  const pad = { t: 8, b: 20 };
  const max = Math.max(1, ...values);
  const n = Math.max(1, values.length);
  const slot = width / n;
  const bw = Math.min(28, slot * (colorAll ? 0.7 : 0.6));
  const ih = height - pad.t - pad.b;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={pad.t + ih} y2={pad.t + ih} stroke={c.hairline} strokeWidth={1} />
          {values.map((v, i) => {
            const h = Math.max(v > 0 ? 3 : 0, (v / max) * ih);
            const cx = slot * i + slot / 2;
            return (
              <Rect
                key={i}
                x={cx - bw / 2}
                y={pad.t + ih - h}
                width={bw}
                height={h}
                rx={Math.min(4, bw / 2)}
                fill={colorAll || i === n - 1 ? color : c.border}
              />
            );
          })}
          {labels.map((l, i) => (
            <SvgText
              key={i}
              x={slot * i + slot / 2}
              y={height - 4}
              fontSize={10}
              fill={c.textMuted}
              textAnchor="middle"
              fontFamily={Fonts.body}>
              {l}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
