import { useAppSettings } from '@/stores/app-settings';

/**
 * Weights are stored in kg and lengths in cm everywhere (database, workout store); these helpers
 * convert at the edges, for what's shown and what's typed in. Pass the unit in explicitly so the
 * React Compiler re-renders text when it changes.
 */
export type WeightUnit = 'kg' | 'lb';
export type LengthUnit = 'cm' | 'in';

export const LB_PER_KG = 2.2046226218;
export const CM_PER_IN = 2.54;

export function useUnits() {
  const weight = useAppSettings((s) => s.weightUnit);
  const length = useAppSettings((s) => s.lengthUnit);
  return { weight, length };
}

/** Units right now, for code outside React (stores, loaders). */
export function currentUnits() {
  const s = useAppSettings.getState();
  return { weight: s.weightUnit, length: s.lengthUnit };
}

const round = (v: number, places = 1) => Math.round(v * 10 ** places) / 10 ** places;

/** kg -> the display unit (unrounded). */
export const fromKg = (kg: number, u: WeightUnit) => (u === 'kg' ? kg : kg * LB_PER_KG);
/** A value typed in the display unit -> kg. */
export const toKg = (v: number, u: WeightUnit) => (u === 'kg' ? v : v / LB_PER_KG);
export const fromCm = (cm: number, u: LengthUnit) => (u === 'cm' ? cm : cm / CM_PER_IN);
export const toCm = (v: number, u: LengthUnit) => (u === 'cm' ? v : v * CM_PER_IN);

/** A weight in the display unit as a bare number, to one decimal: 80 kg -> 176.4 (lb). */
export const weightNumber = (kg: number, u: WeightUnit) => round(fromKg(Number(kg), u));
/** "80 kg" / "176.4 lb". */
export const formatWeight = (kg: number, u: WeightUnit) => `${weightNumber(kg, u).toLocaleString()} ${u}`;
export const lengthNumber = (cm: number, u: LengthUnit) => round(fromCm(Number(cm), u));
export const formatLength = (cm: number, u: LengthUnit) => `${lengthNumber(cm, u)} ${u}`;

/** Total lifted, the full number and never shortened: "12,450 kg", not "12.5t". */
export const formatVolume = (kg: number, u: WeightUnit) => `${Math.round(fromKg(kg, u)).toLocaleString()} ${u}`;

/** Height for display: "180 cm" or "5′ 11″". */
export function formatHeight(cm: number, u: LengthUnit) {
  if (u === 'cm') return `${Math.round(cm)} cm`;
  const inches = Math.round(cm / CM_PER_IN);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}
