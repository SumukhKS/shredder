import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Fonts } from '@/constants/theme';

import { useColors } from './ui/theme';

function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)] as const;
}

/** Minimal line chart: one series, light gridlines, last point emphasised. */
export function LineChart({ values, labels, color, height = 160, unit = '' }: {
  values: number[];
  labels: string[];
  color: string;
  height?: number;
  unit?: string;
}) {
  const c = useColors();
  const [width, onLayout] = useWidth();
  const pad = { l: 36, r: 12, t: 12, b: 22 };

  if (values.length === 0) return <View style={{ height }} onLayout={onLayout} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;
  const iw = Math.max(1, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (values.length === 1 ? iw / 2 : (i / (values.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const ticks = [hi, (hi + lo) / 2, lo];
  const last = values.length - 1;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((t) => (
            <Line key={t} x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={c.hairline} strokeWidth={1} />
          ))}
          {ticks.map((t) => (
            <SvgText key={`l${t}`} x={pad.l - 6} y={y(t) + 4} fontSize={10} fill={c.textMuted} textAnchor="end" fontFamily={Fonts.body}>
              {t.toFixed(span < 5 ? 1 : 0)}
            </SvgText>
          ))}
          <Path d={d} stroke={color} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={x(last)} cy={y(values[last])} r={6} fill={color} stroke={c.surface} strokeWidth={2} />
          <SvgText x={pad.l} y={height - 4} fontSize={10} fill={c.textMuted} fontFamily={Fonts.body}>
            {labels[0]}
          </SvgText>
          <SvgText x={width - pad.r} y={height - 4} fontSize={10} fill={c.textMuted} textAnchor="end" fontFamily={Fonts.body}>
            {labels[last]}
            {unit ? ` (${values[last]}${unit})` : ''}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

/** Minimal bar chart with labels under each bar. */
export function BarChart({ values, labels, color, height = 150 }: {
  values: number[];
  labels: string[];
  color: string;
  height?: number;
}) {
  const c = useColors();
  const [width, onLayout] = useWidth();
  const pad = { t: 8, b: 20 };
  const max = Math.max(1, ...values);
  const n = Math.max(1, values.length);
  const slot = width / n;
  const bw = Math.min(28, slot * 0.6);
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
              <Rect key={i} x={cx - bw / 2} y={pad.t + ih - h} width={bw} height={h} rx={4} fill={i === n - 1 ? color : c.primarySoft} stroke={i === n - 1 ? c.border : 'none'} strokeWidth={i === n - 1 ? 1.5 : 0} />
            );
          })}
          {labels.map((l, i) => (
            <SvgText key={i} x={slot * i + slot / 2} y={height - 4} fontSize={10} fill={c.textMuted} textAnchor="middle" fontFamily={Fonts.body}>
              {l}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
