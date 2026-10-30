import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { applyPending, createOutbox, type Outbox, type OutboxEntry, type OutboxOp, type Sender } from '@/lib/outbox-core';
import { supabase } from '@/lib/supabase';
import type { WorkoutSummary } from '@/types/db';

const RETRY_MS = 30_000;

// Entries belong to the account that made them, and wait for it through sign-outs and expired logins.
const keyFor = (userId: string) => `shredder.outbox.${userId}`;

const send: Sender = async (op) => {
  switch (op.kind) {
    case 'insert':
      return supabase.from(op.table).insert(op.values);
    case 'upsert':
      return supabase.from(op.table).upsert(op.values, { onConflict: op.onConflict });
    case 'update':
      return supabase.from(op.table).update(op.values).match(op.match);
    case 'delete':
      return supabase.from(op.table).delete().match(op.match);
    case 'rpc':
      return supabase.rpc(op.name, op.args);
  }
};

let box: Outbox | null = null;
let unsubscribe: (() => void) | null = null;
let version = 0;
const listeners = new Set<() => void>();
const sentListeners = new Set<() => void>();

function bump() {
  version++;
  listeners.forEach((l) => l());
}

/** Called when the signed-in account changes. */
export function setOutboxUser(userId: string | null) {
  unsubscribe?.();
  unsubscribe = null;
  box = null;
  if (userId) {
    const key = keyFor(userId);
    box = createOutbox(
      {
        load: () => {
          try {
            return JSON.parse(localStorage.getItem(key) ?? '[]') as OutboxEntry[];
          } catch {
            return [];
          }
        },
        save: (entries) => localStorage.setItem(key, JSON.stringify(entries)),
      },
      send
    );
    unsubscribe = box.subscribe((sent) => {
      bump();
      if (sent) sentListeners.forEach((l) => l());
    });
    box.flush(true);
  }
  bump();
}

function current(): Outbox {
  if (!box) throw new Error('Sign in to save this.');
  return box;
}

/** Saves an entry on this phone straight away and sends it when there's a connection. */
export function enqueue(op: OutboxOp, meta?: Record<string, unknown>): OutboxEntry {
  const b = current();
  const entry = b.add(op, meta);
  b.flush(true);
  return entry;
}

export function waitingEntries(): readonly OutboxEntry[] {
  return box?.list() ?? [];
}

export const hasWaitingEntries = () => (box?.pending().length ?? 0) > 0;

/**
 * Tries to send an entry and waits up to `waitMs`. Returns `sent` with the server's reply, `refused`
 * with the reason, or `waiting` if it will go later.
 */
export async function trySend(
  entry: OutboxEntry,
  waitMs: number
): Promise<{ state: 'sent'; data: unknown } | { state: 'refused'; reason: string } | { state: 'waiting' }> {
  const b = current();
  await Promise.race([b.flush(true), new Promise((resolve) => setTimeout(resolve, waitMs))]);
  const now = b.list().find((e) => e.id === entry.id);
  if (!now) return { state: 'sent', data: b.resultOf(entry.id) };
  return now.failed ? { state: 'refused', reason: now.failed } : { state: 'waiting' };
}

export const discardEntry = (id: string) => box?.discard(id);

export function retryEntry(id: string) {
  box?.retry(id);
  box?.flush(true);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Screens re-render when the queue changes. */
export function useOutboxVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

/** Called after an entry reaches the server, so screens can load the real row. */
export function onEntrySent(listener: () => void) {
  sentListeners.add(listener);
  return () => {
    sentListeners.delete(listener);
  };
}

/** Workouts waiting to be sent, and edits to saved ones, applied to a list of summaries. */
export function pendingWorkouts(rows: WorkoutSummary[], day?: string): WorkoutSummary[] {
  let out = rows;
  for (const { op, failed } of waitingEntries()) {
    if (failed) continue;
    if (op.kind === 'rpc' && op.name === 'finish_workout') {
      const p = op.args.p as FinishPayload;
      if ((!day || p.day === day) && !out.some((w) => w.id === p.client_id)) out = [...out, summaryOf(p)];
    } else if (op.kind === 'rpc' && op.name === 'update_workout') {
      const p = op.args.p as FinishPayload & { id: string };
      out = out
        .map((w) => (w.id === p.id ? { ...w, ...summaryOf({ ...p, client_id: p.id }), pr_count: w.pr_count } : w))
        .filter((w) => !day || w.day === day);
    }
  }
  return applyPending(out as unknown as Record<string, unknown>[], waitingEntries(), 'workouts') as unknown as WorkoutSummary[];
}

/** True for a workout saved on this phone that the server hasn't received yet. */
export function isWaitingWorkout(id: string) {
  return waitingEntries().some(
    (e) => e.op.kind === 'rpc' && e.op.name === 'finish_workout' && (e.op.args.p as FinishPayload).client_id === id
  );
}

export interface FinishPayload {
  client_id: string;
  name: string;
  day: string;
  started_at: string;
  finished_at: string;
  exercises: { sets: { set_type: string; weight_kg: number | null; reps: number | null }[] }[];
}

function summaryOf(p: FinishPayload): WorkoutSummary {
  const sets = p.exercises.flatMap((e) => e.sets).filter((s) => s.set_type !== 'warmup');
  return {
    id: p.client_id,
    name: p.name,
    day: p.day,
    started_at: p.started_at,
    duration_s: Math.round((new Date(p.finished_at).getTime() - new Date(p.started_at).getTime()) / 1000),
    total_volume: sets.reduce((v, s) => v + (s.weight_kg ?? 0) * (s.reps ?? 0), 0),
    total_sets: sets.length,
    pr_count: 0,
  };
}

// Retry while the app is open, and straight away on returning to it.
AppState.addEventListener('change', (state) => {
  if (state === 'active') box?.flush(true);
});
setInterval(() => {
  if (AppState.currentState === 'active' && box?.pending().length) box.flush();
}, RETRY_MS);
