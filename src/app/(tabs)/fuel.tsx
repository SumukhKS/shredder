import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MenuSheet } from '@/components/menu-sheet';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Ring } from '@/components/ui/progress';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { SwipeDays } from '@/components/swipe-days';
import { WeekCalendar } from '@/components/week-calendar';
import { Space } from '@/constants/theme';
import { fetchDay } from '@/lib/daily';
import { toDay } from '@/lib/dates';
import { MEALS } from '@/lib/nutrition';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { useSession } from '@/stores/session';
import type { FoodLog } from '@/types/db';

export default function Fuel() {
  const c = useColors();
  const router = useRouter();
  const profile = useSession((s) => s.profile);
  const [day, setDay] = useState(toDay());
  const q = useQuery(() => fetchDay(day), day);
  const [selected, setSelected] = useState<FoodLog | null>(null);

  if (!profile) return null;
  const t = q.data?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const remaining = profile.calorie_target - Math.round(t.kcal);

  async function remove(log: FoodLog) {
    await supabase.from('food_logs').delete().eq('id', log.id);
    q.reload();
  }

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      {/* The log count doubles as a version: adding or removing food refreshes the highlighted days. */}
      <WeekCalendar
        day={day}
        onChange={setDay}
        kind="food"
        version={q.data?.logs.length ?? 0}
        summary={(n, span) => `Food logged on ${n} day${n === 1 ? '' : 's'} this ${span}`}
      />
      <SwipeDays day={day} onChange={setDay}>
        <Card tone="hero" style={{ gap: Space.lg }}>
          <View style={{ alignItems: 'center' }}>
            <Ring value={t.kcal / profile.calorie_target} color={c.primary} size={188} stroke={16}>
              <AppText variant="hero" color={remaining < 0 ? 'danger' : 'text'}>
                {Math.abs(remaining).toLocaleString()}
              </AppText>
              <AppText variant="smallBold" color="textMuted">
                {remaining < 0 ? 'kcal over' : 'kcal left'}
              </AppText>
            </Ring>
          </View>
          <View style={styles.summary}>
            <View>
              <AppText variant="small" color="textMuted">
                Eaten
              </AppText>
              <AppText variant="stat">{Math.round(t.kcal).toLocaleString()}</AppText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="small" color="textMuted">
                Target
              </AppText>
              <AppText variant="stat">{profile.calorie_target.toLocaleString()}</AppText>
            </View>
          </View>
          <View style={styles.rings}>
            <MacroRing label="Protein" value={t.protein} target={profile.protein_g} color={c.protein} />
            <MacroRing label="Carbs" value={t.carbs} target={profile.carbs_g} color={c.carbs} />
            <MacroRing label="Fat" value={t.fat} target={profile.fat_g} color={c.fat} />
          </View>
        </Card>

        <View style={styles.quick}>
          <Button
            label="Search food"
            icon="search"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/food/search', params: { day } })}
          />
          <Button
            label="Scan"
            icon="barcode-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/food/scan', params: { day } })}
          />
        </View>

        {MEALS.map((m) => {
          const logs = (q.data?.logs ?? []).filter((l) => l.meal === m.key);
          const kcal = logs.reduce((s, l) => s + Number(l.kcal), 0);
          return (
            <Card key={m.key} tone="flat" style={{ gap: Space.sm }}>
              <View style={styles.mealHead}>
                <AppText variant="h3" style={{ flex: 1 }}>
                  {m.label}
                </AppText>
                <AppText variant="smallBold" color="textMuted">
                  {Math.round(kcal)} kcal
                </AppText>
                <IconButton
                  icon="add-circle"
                  color={c.primary}
                  size={26}
                  label={`Add to ${m.label}`}
                  onPress={() => router.push({ pathname: '/food/search', params: { day, meal: m.key } })}
                />
              </View>
              {logs.length === 0 ? (
                <AppText variant="small" color="textMuted">
                  Nothing logged yet.
                </AppText>
              ) : (
                logs.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => setSelected(l)}
                    accessibilityRole="button"
                    style={[styles.logRow, { borderColor: c.hairline }]}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyBold" numberOfLines={1}>
                        {l.food_name}
                      </AppText>
                      <AppText variant="small" color="textMuted">
                        {Math.round(Number(l.grams))} g, P {Math.round(Number(l.protein))} C {Math.round(Number(l.carbs))} F{' '}
                        {Math.round(Number(l.fat))}
                      </AppText>
                    </View>
                    <AppText variant="bodyBold">{Math.round(Number(l.kcal))}</AppText>
                  </Pressable>
                ))
              )}
            </Card>
          );
        })}

        <MenuSheet
          visible={!!selected}
          title={selected?.food_name}
          onClose={() => setSelected(null)}
          options={
            selected
              ? [
                  {
                    label: 'Log again today',
                    icon: 'repeat',
                    onPress: async () => {
                      const { id, created_at, ...rest } = selected;
                      void id;
                      void created_at;
                      await supabase.from('food_logs').insert({ ...rest, day: toDay() });
                      q.reload();
                    },
                  },
                  { label: 'Delete entry', icon: 'trash-outline', destructive: true, onPress: () => remove(selected) },
                ]
              : []
          }
        />
      </SwipeDays>
    </Screen>
  );
}

function MacroRing({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: Space.xs }}>
      <Ring value={value / target} color={color} size={78} stroke={9}>
        <AppText variant="bodyBold">{Math.round(value)}</AppText>
        <AppText variant="small" color="textMuted" style={{ fontSize: 11 }}>
          / {target}g
        </AppText>
      </Ring>
      <AppText variant="smallBold">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  rings: { flexDirection: 'row', justifyContent: 'space-around' },
  quick: { flexDirection: 'row', gap: Space.md },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingVertical: Space.sm, borderTopWidth: 1 },
});
