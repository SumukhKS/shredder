import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow, Segmented } from '@/components/ui/chips';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { WheelField } from '@/components/ui/wheel-field';
import { Space } from '@/constants/theme';
import {
  bmi,
  bmiBodyFat,
  bmiCategory,
  bmr,
  bmrLean,
  bodyFatCategory,
  healthyWeightRange,
  idealWeight,
  MACRO_PRESETS,
  macroGrams,
  navyBodyFat,
  oneRepMax,
  PERCENT_REPS,
  skinfoldBodyFat,
  skinfoldSites,
  type SkinfoldMethod,
  waterMl,
} from '@/lib/calculators';
import { ACTIVITY, computeTargets, GOALS } from '@/lib/nutrition';
import { ageFrom, saveBodyMetrics } from '@/lib/profile';
import { toDay } from '@/lib/dates';
import { formatWeight, fromCm, fromKg, toCm, toKg, useUnits } from '@/lib/units';
import { useSession } from '@/stores/session';
import type { ActivityLevel, Goal, Sex } from '@/types/db';

type Calc = 'calories' | 'macros' | 'bodyfat' | 'bmi' | 'bmr' | '1rm' | 'ideal' | 'water';
const CALCS: { key: Calc; label: string }[] = [
  { key: 'calories', label: 'Calories' },
  { key: 'macros', label: 'Macros' },
  { key: 'bodyfat', label: 'Body fat' },
  { key: 'bmi', label: 'BMI' },
  { key: 'bmr', label: 'BMR' },
  { key: '1rm', label: 'One-rep max' },
  { key: 'ideal', label: 'Ideal weight' },
  { key: 'water', label: 'Water' },
];

type FatMethod = 'navy' | SkinfoldMethod | 'bmi';
const FAT_METHODS: { key: FatMethod; label: string; note: string }[] = [
  {
    key: 'navy',
    label: 'U.S. Navy (tape)',
    note: 'Measure the neck below the larynx and the waist at the navel (women: at the narrowest point, and the hips at the widest).',
  },
  { key: 'jp3', label: 'Caliper: 3 site', note: 'Jackson-Pollock. Take readings on the right side, in millimetres.' },
  { key: 'jp7', label: 'Caliper: 7 site', note: 'Jackson-Pollock. Take readings on the right side, in millimetres.' },
  { key: 'dw4', label: 'Caliper: 4 site', note: 'Durnin-Womersley. Take readings on the right side, in millimetres.' },
  {
    key: 'bmi',
    label: 'BMI estimate',
    note: "Deurenberg. The roughest method: it can't tell muscle from fat, so it reads high if you carry a lot of muscle.",
  },
];

// Wheel ranges, in the unit shown.
const WEIGHT = { kg: { min: 30, max: 250, step: 0.5, start: 70 }, lb: { min: 60, max: 550, step: 1, start: 155 } };
const LIFT = { kg: { min: 1, max: 500, step: 0.5, start: 60 }, lb: { min: 1, max: 1100, step: 1, start: 135 } };
const HEIGHT = { cm: { min: 100, max: 250, step: 1, start: 170 }, in: { min: 40, max: 100, step: 0.5, start: 67 } };
const NECK = { cm: { min: 20, max: 70, step: 0.5, start: 38 }, in: { min: 8, max: 28, step: 0.25, start: 15 } };
const WAIST = { cm: { min: 40, max: 200, step: 0.5, start: 85 }, in: { min: 16, max: 80, step: 0.25, start: 33 } };
const HIPS = { cm: { min: 50, max: 200, step: 0.5, start: 95 }, in: { min: 20, max: 80, step: 0.25, start: 37 } };

const round1 = (n: number) => String(Math.round(n * 10) / 10);
const num = (s: string) => Number(s.replace(',', '.')) || 0;

/** Settings > Calculators. Starts from your profile; only a body fat result you choose to save is kept. */
export default function Calculators() {
  const profile = useSession((s) => s.profile);
  const units = useUnits();
  const [calc, setCalc] = useState<Calc>('calories');
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'male');
  const [age, setAge] = useState(() =>
    profile?.birthday
      ? String(ageFrom(profile.birthday))
      : profile?.birth_year
        ? String(new Date().getFullYear() - profile.birth_year)
        : ''
  );
  const [height, setHeight] = useState(() => (profile?.height_cm ? round1(fromCm(Number(profile.height_cm), units.length)) : ''));
  const [weight, setWeight] = useState(() => (profile?.weight_kg ? round1(fromKg(Number(profile.weight_kg), units.weight)) : ''));
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activity_level ?? 'moderate');
  const [goal, setGoal] = useState<Goal>(profile?.goal ?? 'maintain');
  const [fatMethod, setFatMethod] = useState<FatMethod>('navy');
  const [skinfolds, setSkinfolds] = useState<Record<string, string>>({});
  const [savedFat, setSavedFat] = useState<number | null>(null);
  const [neck, setNeck] = useState('');
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [lift, setLift] = useState('');
  const [reps, setReps] = useState('');
  const [calories, setCalories] = useState(() => (profile?.calorie_target ? String(profile.calorie_target) : ''));
  const [preset, setPreset] = useState(MACRO_PRESETS[0].key);
  const [training, setTraining] = useState('1');

  const ageN = num(age);
  const cm = toCm(num(height), units.length);
  const kg = toKg(num(weight), units.weight);
  const len = (v: string) => toCm(num(v), units.length);
  const needs = { sex: true, age: false, height: false, weight: false };
  if (calc === 'calories' || calc === 'bmr') Object.assign(needs, { age: true, height: true, weight: true });
  if (calc === 'ideal') needs.height = true;
  if (calc === 'bodyfat') {
    needs.height = fatMethod === 'navy' || fatMethod === 'bmi';
    needs.age = fatMethod !== 'navy';
    needs.weight = fatMethod === 'bmi';
  }
  if (calc === 'bmi') Object.assign(needs, { height: true, weight: true, sex: false });
  if (calc === 'water') Object.assign(needs, { weight: true, sex: false });
  if (calc === '1rm' || calc === 'macros') needs.sex = false;
  const ready = (!needs.age || ageN > 0) && (!needs.height || cm > 0) && (!needs.weight || kg > 0);

  return (
    <Screen padTop={false}>
      <ChipRow>
        {CALCS.map((c) => (
          <Chip key={c.key} label={c.label} selected={calc === c.key} onPress={() => setCalc(c.key)} />
        ))}
      </ChipRow>

      {needs.sex ? (
        <Segmented<Sex>
          options={[
            { key: 'male', label: 'Male' },
            { key: 'female', label: 'Female' },
          ]}
          value={sex}
          onChange={setSex}
        />
      ) : null}
      <View style={styles.row}>
        {needs.age ? (
          <View style={{ flex: 1 }}>
            <WheelField label="Age" value={age} onChange={setAge} min={13} max={100} start={25} suffix="yrs" />
          </View>
        ) : null}
        {needs.height ? (
          <View style={{ flex: 1 }}>
            <WheelField label="Height" value={height} onChange={setHeight} {...HEIGHT[units.length]} suffix={units.length} />
          </View>
        ) : null}
        {needs.weight ? (
          <View style={{ flex: 1 }}>
            <WheelField label="Weight" value={weight} onChange={setWeight} {...WEIGHT[units.weight]} suffix={units.weight} />
          </View>
        ) : null}
      </View>

      {calc === 'calories' ? (
        <>
          <SectionHeader title="Activity" />
          <ChipRow>
            {ACTIVITY.map((a) => (
              <Chip key={a.key} label={a.title} selected={activity === a.key} onPress={() => setActivity(a.key)} />
            ))}
          </ChipRow>
          <SectionHeader title="Goal" />
          <ChipRow>
            {GOALS.map((g) => (
              <Chip key={g.key} label={g.title} selected={goal === g.key} onPress={() => setGoal(g.key)} />
            ))}
          </ChipRow>
          {ready ? (
            (() => {
              const t = computeTargets({ sex, age: ageN, heightCm: cm, weightKg: kg, activity, goal });
              return (
                <Result
                  big={`${t.calories.toLocaleString()} kcal`}
                  caption="a day for your goal"
                  lines={[
                    ['Maintenance (TDEE)', `${t.tdee.toLocaleString()} kcal`],
                    ['Lose about 0.5 kg a week', `${Math.max(1200, t.tdee - 500).toLocaleString()} kcal`],
                    ['Gain about 0.25 kg a week', `${(t.tdee + 250).toLocaleString()} kcal`],
                    ['Protein', `${t.protein} g`],
                    ['Carbs', `${t.carbs} g`],
                    ['Fat', `${t.fat} g`],
                  ]}
                />
              );
            })()
          ) : (
            <Missing />
          )}
        </>
      ) : null}

      {calc === 'macros' ? (
        <>
          <WheelField
            label="Calories"
            value={calories}
            onChange={setCalories}
            min={800}
            max={10000}
            step={10}
            start={2000}
            suffix="kcal"
          />
          <ChipRow>
            {MACRO_PRESETS.map((p) => (
              <Chip key={p.key} label={p.label} selected={preset === p.key} onPress={() => setPreset(p.key)} />
            ))}
          </ChipRow>
          {num(calories) > 0 ? (
            (() => {
              const p = MACRO_PRESETS.find((x) => x.key === preset) ?? MACRO_PRESETS[0];
              const g = macroGrams(num(calories), p);
              return (
                <Result
                  big={`${g.protein} g protein`}
                  caption={`${p.protein}% protein, ${p.carbs}% carbs, ${p.fat}% fat`}
                  lines={[
                    ['Protein', `${g.protein} g`],
                    ['Carbs', `${g.carbs} g`],
                    ['Fat', `${g.fat} g`],
                  ]}
                />
              );
            })()
          ) : (
            <Missing what="your daily calories" />
          )}
        </>
      ) : null}

      {calc === 'bodyfat' ? (
        <>
          <ChipRow>
            {FAT_METHODS.map((m) => (
              <Chip key={m.key} label={m.label} selected={fatMethod === m.key} onPress={() => setFatMethod(m.key)} />
            ))}
          </ChipRow>
          {fatMethod === 'navy' ? (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <WheelField label="Neck" value={neck} onChange={setNeck} {...NECK[units.length]} suffix={units.length} />
              </View>
              <View style={{ flex: 1 }}>
                <WheelField label="Waist" value={waist} onChange={setWaist} {...WAIST[units.length]} suffix={units.length} />
              </View>
              {sex === 'female' ? (
                <View style={{ flex: 1 }}>
                  <WheelField label="Hips" value={hips} onChange={setHips} {...HIPS[units.length]} suffix={units.length} />
                </View>
              ) : null}
            </View>
          ) : null}
          {fatMethod === 'jp3' || fatMethod === 'jp7' || fatMethod === 'dw4'
            ? skinfoldSites(fatMethod, sex).map((site) => (
                <WheelField
                  key={site}
                  label={site}
                  value={skinfolds[site] ?? ''}
                  onChange={(v) => setSkinfolds((all) => ({ ...all, [site]: v }))}
                  min={1}
                  max={80}
                  step={0.5}
                  start={15}
                  suffix="mm"
                />
              ))
            : null}
          <AppText variant="small" color="textMuted">
            {FAT_METHODS.find((m) => m.key === fatMethod)?.note}
          </AppText>
          {(() => {
            const pct =
              fatMethod === 'navy'
                ? cm > 0
                  ? navyBodyFat(sex, cm, len(neck), len(waist), len(hips))
                  : null
                : fatMethod === 'bmi'
                  ? bmiBodyFat(sex, ageN, cm, kg)
                  : skinfoldBodyFat(
                      fatMethod,
                      sex,
                      ageN,
                      skinfoldSites(fatMethod, sex).map((site) => num(skinfolds[site] ?? ''))
                    );
            return pct != null ? (
              <>
                <Result
                  big={`${pct}%`}
                  caption={bodyFatCategory(sex, pct)}
                  lines={
                    kg > 0
                      ? [
                          ['Fat mass', formatWeight((kg * pct) / 100, units.weight)],
                          ['Lean mass', formatWeight(kg * (1 - pct / 100), units.weight)],
                        ]
                      : []
                  }
                />
                <Button
                  label={savedFat === pct ? 'Saved to Measurements' : 'Save to Measurements'}
                  icon={savedFat === pct ? 'checkmark' : 'body-outline'}
                  variant="secondary"
                  disabled={savedFat === pct || !profile}
                  onPress={() => {
                    saveBodyMetrics(profile!.id, toDay(), { body_fat_pct: pct });
                    setSavedFat(pct);
                  }}
                />
              </>
            ) : (
              <Missing
                what={
                  fatMethod === 'navy' ? 'height, neck and waist' : fatMethod === 'bmi' ? undefined : 'your age and every site'
                }
              />
            );
          })()}
        </>
      ) : null}

      {calc === 'bmi' ? (
        ready ? (
          (() => {
            const v = bmi(cm, kg);
            const [lo, hi] = healthyWeightRange(cm);
            return (
              <Result
                big={String(v)}
                caption={bmiCategory(v)}
                lines={[
                  ['Healthy weight for your height', `${formatWeight(lo, units.weight)} to ${formatWeight(hi, units.weight)}`],
                ]}
                note="BMI doesn't tell muscle from fat, so it reads high for muscular people. Body fat is the better measure."
              />
            );
          })()
        ) : (
          <Missing />
        )
      ) : null}

      {calc === 'bmr' ? (
        <>
          <WheelField
            label="Body fat (optional)"
            value={bodyFat}
            onChange={setBodyFat}
            min={3}
            max={60}
            step={0.5}
            start={20}
            clearable
            suffix="%"
            hint="With body fat, the lean-mass formula (Katch-McArdle) is shown too."
          />
          {ready ? (
            <Result
              big={`${bmr(sex, ageN, cm, kg).toLocaleString()} kcal`}
              caption="burned a day at complete rest (Mifflin-St Jeor)"
              lines={num(bodyFat) > 0 ? [['Katch-McArdle', `${bmrLean(kg, num(bodyFat)).toLocaleString()} kcal`]] : []}
            />
          ) : (
            <Missing />
          )}
        </>
      ) : null}

      {calc === '1rm' ? (
        <>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <WheelField label="Weight lifted" value={lift} onChange={setLift} {...LIFT[units.weight]} suffix={units.weight} />
            </View>
            <View style={{ flex: 1 }}>
              <WheelField label="Reps" value={reps} onChange={setReps} min={1} max={30} start={5} />
            </View>
          </View>
          {num(lift) > 0 && num(reps) > 0 ? (
            (() => {
              const max = oneRepMax(num(lift), Math.round(num(reps)));
              return (
                <Result
                  big={`${round1(max)} ${units.weight}`}
                  caption="estimated one-rep max"
                  lines={PERCENT_REPS.slice(1).map(([pct, r]) => [
                    `${pct}% (about ${r} reps)`,
                    `${round1((max * pct) / 100)} ${units.weight}`,
                  ])}
                />
              );
            })()
          ) : (
            <Missing what="a weight and reps from a recent set" />
          )}
        </>
      ) : null}

      {calc === 'ideal' ? (
        cm > 0 ? (
          (() => {
            const [lo, hi] = healthyWeightRange(cm);
            return (
              <Result
                big={formatWeight(idealWeight(sex, cm), units.weight)}
                caption="ideal weight (Devine formula)"
                lines={[['Healthy BMI range', `${formatWeight(lo, units.weight)} to ${formatWeight(hi, units.weight)}`]]}
                note="Built for average frames; with more muscle, a higher weight is normal."
              />
            );
          })()
        ) : (
          <Missing what="your height" />
        )
      ) : null}

      {calc === 'water' ? (
        <>
          <WheelField label="Training a day" value={training} onChange={setTraining} min={0} max={8} step={0.25} suffix="hours" />
          {kg > 0 ? (
            <Result
              big={`${(waterMl(kg, num(training)) / 1000).toLocaleString()} L`}
              caption="of water a day"
              lines={[['Glasses (250 ml)', String(waterMl(kg, num(training)) / 250)]]}
              note="35 ml per kg of body weight, plus 500 ml per hour of training. Drink more in hot weather."
            />
          ) : (
            <Missing what="your weight" />
          )}
        </>
      ) : null}
    </Screen>
  );
}

function Result({ big, caption, lines, note }: { big: string; caption: string; lines: [string, string][]; note?: string }) {
  return (
    <Card tone="flat" style={{ gap: Space.sm }}>
      <AppText variant="h1" color="primary">
        {big}
      </AppText>
      <AppText variant="small" color="textMuted">
        {caption}
      </AppText>
      {lines.map(([k, v]) => (
        <View key={k} style={styles.line}>
          <AppText variant="body" color="textMuted" style={{ flex: 1 }}>
            {k}
          </AppText>
          <AppText variant="bodyBold">{v}</AppText>
        </View>
      ))}
      {note ? (
        <AppText variant="small" color="textMuted">
          {note}
        </AppText>
      ) : null}
    </Card>
  );
}

function Missing({ what = 'your age, height and weight' }: { what?: string }) {
  return (
    <AppText variant="small" color="textMuted">
      Choose {what} to see the result.
    </AppText>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
});
