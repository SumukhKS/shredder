import { Platform } from 'react-native';

import { addDays, fromDay, toDay } from '@/lib/dates';
import { sensorStepsByDay, sensorStepsByHour } from '@/lib/step-sensor';
import { supabase } from '@/lib/supabase';
import { useAppSettings } from '@/stores/app-settings';

/**
 * Steps and sleep from Android Health Connect. Fitbit, Samsung Health, Google Fit,
 * Garmin, Mi Fitness and most watches write into Health Connect, so reading it
 * covers all of them without a separate login for each.
 */
const usesPhoneSensor = () => useAppSettings.getState().stepsSource === 'phone_sensor';

export type HealthStatus = 'unsupported' | 'not_installed' | 'needs_update' | 'disconnected' | 'connected';

const PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
] as const;

// Loaded lazily: the native module only exists in Android builds.
const hc = () => import('react-native-health-connect');

async function ready(): Promise<HealthStatus> {
  if (Platform.OS !== 'android') return 'unsupported';
  try {
    const { getSdkStatus, initialize, SdkAvailabilityStatus } = await hc();
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'not_installed';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs_update';
    return (await initialize()) ? 'disconnected' : 'not_installed';
  } catch {
    return 'unsupported';
  }
}

export async function healthStatus(): Promise<HealthStatus> {
  const base = await ready();
  if (base !== 'disconnected') return base;
  const { getGrantedPermissions } = await hc();
  const granted = await getGrantedPermissions();
  const has = (type: string) => granted.some((p) => p.accessType === 'read' && p.recordType === type);
  return has('Steps') || has('SleepSession') ? 'connected' : 'disconnected';
}

/** Shows the Health Connect permission screen. Returns the new status. */
export async function connectHealth(): Promise<HealthStatus> {
  const base = await ready();
  if (base !== 'disconnected') return base;
  const { requestPermission } = await hc();
  await requestPermission([...PERMISSIONS]);
  return healthStatus();
}

/** Health Connect's own screen, where people pick which apps share data. */
export async function openHealthSettings() {
  if (Platform.OS !== 'android') return;
  const { openHealthConnectSettings } = await hc();
  openHealthConnectSettings();
}

/** Total steps on each local day from `from` to `to` (Health Connect de-duplicates phone and watch). */
async function stepsByDay(from: string, to: string): Promise<Record<string, number>> {
  const { aggregateGroupByPeriod } = await hc();
  const start = fromDay(from);
  const end = new Date(Math.min(fromDay(addDays(to, 1)).getTime(), Date.now()));
  if (end <= start) return {};
  const groups = await aggregateGroupByPeriod({
    recordType: 'Steps',
    timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    timeRangeSlicer: { period: 'DAYS', length: 1 },
  });
  const out: Record<string, number> = {};
  for (const g of groups) out[toDay(new Date(g.startTime))] = Math.round(g.result.COUNT_TOTAL ?? 0);
  return out;
}

/** Every sleep session overlapping a time range, following Health Connect's pages. */
async function sleepSessions(start: Date, end: Date) {
  const { readRecords } = await hc();
  const spans: (readonly [number, number])[] = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords('SleepSession', {
      timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
      pageSize: 1000,
      pageToken,
    });
    for (const r of page.records) spans.push([new Date(r.startTime).getTime(), new Date(r.endTime).getTime()] as const);
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return spans;
}

/**
 * Minutes slept for each day from `from` to `to`: a day gets the sleep that ended on its
 * morning, i.e. sessions ending between 6 pm the evening before and 6 pm on the day.
 * Overlapping sessions from two sources count once.
 */
async function sleepByDay(from: string, to: string): Promise<Record<string, number>> {
  const first = fromDay(addDays(from, -1)).getTime() + 6 * 3600_000;
  const last = fromDay(to).getTime() + 18 * 3600_000;
  const spans = (await sleepSessions(new Date(first), new Date(last))).sort((a, b) => a[0] - b[0]);
  const out: Record<string, number> = {};
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const lo = fromDay(addDays(day, -1)).getTime() + 18 * 3600_000;
    const hi = fromDay(day).getTime() + 18 * 3600_000;
    let total = 0;
    let cursor = 0;
    for (const [start, end] of spans) {
      if (end <= lo || end > hi) continue;
      const s0 = Math.max(start, cursor);
      if (end > s0) total += end - s0;
      cursor = Math.max(cursor, end);
    }
    if (total > 0) out[day] = Math.round(total / 60_000);
  }
  return out;
}

/** Steps in each hour of a local day (24 values), or null when Health Connect isn't connected. */
export async function stepsByHour(day: string): Promise<number[] | null> {
  if (usesPhoneSensor()) return sensorStepsByHour(day);
  if ((await healthStatus()) !== 'connected') return null;
  const { aggregateGroupByDuration } = await hc();
  const start = fromDay(day);
  const end = new Date(Math.min(fromDay(addDays(day, 1)).getTime(), Date.now()));
  const hours = new Array<number>(24).fill(0);
  if (end <= start) return hours;
  const groups = await aggregateGroupByDuration({
    recordType: 'Steps',
    timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    timeRangeSlicer: { duration: 'HOURS', length: 1 },
  });
  for (const g of groups) {
    const h = new Date(g.startTime).getHours();
    hours[h] += Math.round(g.result.COUNT_TOTAL ?? 0);
  }
  return hours;
}

export type SleepStage = 'awake' | 'light' | 'deep' | 'rem' | 'asleep';

export interface SleepNight {
  start: number;
  end: number;
  /** Stage spans in time order (empty when the device records no stages). */
  stages: { stage: SleepStage; start: number; end: number }[];
  /** Minutes spent in each stage. */
  minutes: Record<SleepStage, number>;
}

// Health Connect's SleepStageType: 1 awake, 2 asleep (unspecified), 3 out of bed, 4 light, 5 deep, 6 REM.
const STAGE: Record<number, SleepStage> = { 1: 'awake', 2: 'asleep', 3: 'awake', 4: 'light', 5: 'deep', 6: 'rem', 7: 'awake' };

/**
 * The main sleep for a day (same window as the daily total), with its stages when
 * the device tracks them. With several sources, the one with the most detail wins.
 * Null when not connected or when nothing was recorded.
 */
export async function sleepNight(day: string): Promise<SleepNight | null> {
  if ((await healthStatus()) !== 'connected') return null;
  const { readRecords } = await hc();
  const from = fromDay(addDays(day, -1)).getTime() + 18 * 3600_000;
  const to = fromDay(day).getTime() + 18 * 3600_000;
  const { records } = await readRecords('SleepSession', {
    timeRangeFilter: {
      operator: 'between',
      startTime: new Date(from - 12 * 3600_000).toISOString(),
      endTime: new Date(to).toISOString(),
    },
  });
  const nights = records
    .map((r) => ({
      start: new Date(r.startTime).getTime(),
      end: new Date(r.endTime).getTime(),
      stages: (r.stages ?? [])
        .filter((st) => STAGE[st.stage])
        .map((st) => ({ stage: STAGE[st.stage], start: new Date(st.startTime).getTime(), end: new Date(st.endTime).getTime() }))
        .sort((a, b) => a.start - b.start),
    }))
    .filter((n) => n.end > from && n.end <= to);
  if (!nights.length) return null;
  const best = nights.sort((a, b) => b.stages.length - a.stages.length || b.end - b.start - (a.end - a.start))[0];
  const minutes: Record<SleepStage, number> = { awake: 0, light: 0, deep: 0, rem: 0, asleep: 0 };
  for (const st of best.stages) minutes[st.stage] += Math.round((st.end - st.start) / 60_000);
  if (!best.stages.length) minutes.asleep = Math.round((best.end - best.start) / 60_000);
  return { ...best, minutes };
}

/**
 * Pull steps and sleep for the `days` days ending on `to` into Shredder, in one batch.
 * Health Connect only shares what it's allowed to: without the history permission that's
 * data from up to 30 days before Shredder was first connected. Quietly does nothing if not connected.
 */
export async function syncHealth(userId: string, to: string, days = 7): Promise<boolean> {
  const phone = usesPhoneSensor();
  const connected = (await healthStatus()) === 'connected';
  if (!connected && !phone) return false;
  const from = addDays(to, -(days - 1));
  const none = {} as Record<string, number>;
  const [steps, sleep, existing] = await Promise.all([
    phone ? sensorStepsByDay() : stepsByDay(from, to).catch(() => none),
    connected ? sleepByDay(from, to).catch(() => none) : none,
    supabase.from('daily_health').select('day, steps, sleep_min, source').gte('day', from).lte('day', to),
  ]);
  const rows = new Map((existing.data ?? []).map((r) => [r.day as string, r]));
  const updates = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const had = rows.get(day);
    // A number typed in by hand wins over the sync for that day.
    const manual = had?.source === 'manual';
    const next: { steps: number | null; sleep_min: number | null } = {
      steps: had?.steps ?? null,
      sleep_min: had?.sleep_min ?? null,
    };
    let changed = false;
    const st = steps[day] ?? 0;
    const sl = Math.min(sleep[day] ?? 0, 1440);
    // The sensor only knows what it counted since it was turned on, so it never lowers a number from before.
    const fromBefore = phone && had?.source !== 'phone_sensor' && (had?.steps ?? 0) > st;
    if (st > 0 && !fromBefore && !(manual && had?.steps != null) && st !== had?.steps) {
      next.steps = st;
      changed = true;
    }
    if (sl > 0 && !(manual && had?.sleep_min != null) && sl !== had?.sleep_min) {
      next.sleep_min = sl;
      changed = true;
    }
    if (changed)
      updates.push({
        user_id: userId,
        day,
        ...next,
        source: manual ? 'manual' : phone ? 'phone_sensor' : 'health_connect',
        updated_at: new Date().toISOString(),
      });
  }
  for (let i = 0; i < updates.length; i += 200) {
    const { error } = await supabase.from('daily_health').upsert(updates.slice(i, i + 200), { onConflict: 'user_id,day' });
    if (error) throw error;
  }
  return true;
}

// Set once the past year has been pulled for an account; later syncs only need the last week.
const BACKFILL_KEY = 'shredder.healthBackfill';
let lastSync = 0;

/**
 * `syncHealth` for the past week, at most once every 15 minutes (reading Health Connect wakes
 * another app's process, so doing it on every screen visit costs battery). `force` skips the wait.
 */
export async function syncHealthThrottled(userId: string, today: string, force = false): Promise<boolean> {
  if (!force && Date.now() - lastSync < 15 * 60_000) return false;
  lastSync = Date.now();
  return syncHealth(userId, today);
}

/**
 * Pull the past year (as far back as Health Connect allows) once per account on this phone, or
 * again with `force` (right after connecting). It reads a year of records, so it isn't repeated
 * on every launch.
 */
export async function backfillHealth(userId: string, today: string, force = false): Promise<boolean> {
  if (!force && localStorage.getItem(BACKFILL_KEY) === userId) return false;
  const ok = await syncHealth(userId, today, 365);
  if (ok) localStorage.setItem(BACKFILL_KEY, userId);
  return ok;
}
