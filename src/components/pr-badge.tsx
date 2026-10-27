import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';

/** Gold medal on a ribbon, used everywhere a personal record shows. `size` is its height. */
export function PrBadge({ size = 18, label = 'Personal record' }: { size?: number; label?: string }) {
  return (
    <Svg width={(size * 32) / 40} height={size} viewBox="0 0 32 40" accessibilityLabel={label} accessibilityRole="image">
      <Defs>
        <LinearGradient id="pr-gold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF1A8" />
          <Stop offset="0.45" stopColor="#FFC531" />
          <Stop offset="1" stopColor="#D97A00" />
        </LinearGradient>
        <LinearGradient id="pr-ribbon" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF7A3D" />
          <Stop offset="1" stopColor="#E0301E" />
        </LinearGradient>
      </Defs>
      {/* Ribbon */}
      <Path d="M6,0 L14,0 L19,15 L12,18 Z" fill="url(#pr-ribbon)" />
      <Path d="M26,0 L18,0 L13,15 L20,18 Z" fill="#B8231A" />
      {/* Medal: rim, face, inner ring and star */}
      <Circle cx={16} cy={26} r={13} fill="#A85A00" />
      <Circle cx={16} cy={26} r={11.5} fill="url(#pr-gold)" />
      <Circle cx={16} cy={26} r={8.5} fill="none" stroke="#FFF4C2" strokeWidth={1.2} strokeOpacity={0.8} />
      <Path
        d="M16,19.2 L17.9,23.6 L22.6,24 L19,27.1 L20.1,31.7 L16,29.2 L11.9,31.7 L13,27.1 L9.4,24 L14.1,23.6 Z"
        fill="#FFFBEA"
        stroke="#C77800"
        strokeWidth={0.6}
      />
      <Ellipse cx={11.5} cy={20.5} rx={3.2} ry={1.6} fill="#FFFFFF" opacity={0.55} transform="rotate(-35 11.5 20.5)" />
    </Svg>
  );
}
