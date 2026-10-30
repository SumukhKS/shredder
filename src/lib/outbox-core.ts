// The offline queue's logic, with no React Native imports so tests can run it directly.
// Entries are stored before anything is sent, then sent strictly in order.

export type OutboxOp =
  | { kind: 'insert'; table: string; values: Record<string, unknown> | Record<string, unknown>[] }
  | { kind: 'upsert'; table: string; values: Record<string, unknown>; onConflict: string }
  | { kind: 'update'; table: string; values: Record<string, unknown>; match: Record<string, string> }
  | { kind: 'delete'; table: string; match: Record<string, string> }
  | { kind: 'rpc'; name: string; args: Record<string, unknown> };

export interface OutboxEntry {
  id: string;
  op: OutboxOp;
  createdAt: string;
  attempts: number;
  /** Why the server refused it. Refused entries wait in Settings and are never deleted automatically. */
  failed?: string;
  /** What screens need to show the entry that the database row doesn't hold. */
  meta?: Record<string, unknown>;
}

export interface SendError {
  code?: string;
  message?: string;
  status?: number;
}

export type Verdict = 'ok' | 'retry' | 'login' | 'refused';

/** What to do after a send: done, try later (no connection), wait for sign-in, or give up and show the user. */
export function classify(error: SendError | null | undefined, op: OutboxOp): Verdict {
  if (!error) return 'ok';
  const { code = '', message = '', status } = error;
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303' || /jwt|not authenticated/i.test(message)) return 'login';
  // The row is already there: an earlier send reached the server but its reply didn't reach us.
  if (code === '23505' && op.kind === 'insert') return 'ok';
  if (/^(22|23|42|P0)/.test(code) || /^PGRST[12]/.test(code)) return 'refused';
  if (status != null && status >= 400 && status < 500 && status !== 408 && status !== 429) return 'refused';
  return 'retry';
}

/** A random v4 UUID, so an entry has its id before the server has seen it. */
export function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

export interface OutboxStore {
  load: () => OutboxEntry[];
  save: (entries: OutboxEntry[]) => void;
}

export type Sender = (op: OutboxOp) => Promise<{ data?: unknown; error?: SendError | null }>;

const BASE_DELAY = 5_000;
const MAX_DELAY = 5 * 60_000;

export function createOutbox(store: OutboxStore, send: Sender, options: { now?: () => number; timeoutMs?: number } = {}) {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 20_000;
  let entries = store.load();
  let flushing: Promise<void> | null = null;
  let blockedUntil = 0;
  let misses = 0;
  const listeners = new Set<(sent: boolean) => void>();
  const results = new Map<string, unknown>();

  const changed = (sent = false) => {
    store.save(entries);
    listeners.forEach((l) => l(sent));
  };

  const withTimeout = (op: OutboxOp) =>
    new Promise<{ data?: unknown; error?: SendError | null }>((resolve) => {
      const t = setTimeout(() => resolve({ error: { message: 'Timed out' } }), timeoutMs);
      send(op).then(
        (r) => {
          clearTimeout(t);
          resolve(r);
        },
        (e) => {
          clearTimeout(t);
          resolve({ error: { message: e instanceof Error ? e.message : 'Network error' } });
        }
      );
    });

  async function run() {
    for (;;) {
      const head = entries.find((e) => !e.failed);
      if (!head) return;
      head.attempts++;
      const { data, error } = await withTimeout(head.op);
      const verdict = classify(error, head.op);
      if (verdict === 'ok') {
        results.set(head.id, data);
        entries = entries.filter((e) => e !== head);
        misses = 0;
        changed(true);
      } else if (verdict === 'refused') {
        head.failed = error?.message || 'The server refused this entry.';
        changed();
      } else {
        // Nothing later can go ahead of it, so the queue stops until the connection or sign-in returns.
        misses++;
        blockedUntil = now() + Math.min(BASE_DELAY * 2 ** (misses - 1), MAX_DELAY);
        changed();
        return;
      }
    }
  }

  return {
    list: () => entries,
    pending: () => entries.filter((e) => !e.failed),
    refused: () => entries.filter((e) => e.failed),
    /** Stores the entry on the device. The caller then flushes. */
    add(op: OutboxOp, meta?: Record<string, unknown>): OutboxEntry {
      const entry: OutboxEntry = { id: newId(), op, createdAt: new Date(now()).toISOString(), attempts: 0, meta };
      entries = [...entries, entry];
      changed();
      return entry;
    },
    /** Sends what's waiting, unless a recent failure says to hold off. `force` ignores that, for example on returning to the app. */
    flush(force = false): Promise<void> {
      if (flushing) return flushing;
      if (!force && now() < blockedUntil) return Promise.resolve();
      flushing = run().finally(() => {
        flushing = null;
      });
      return flushing;
    },
    /** The server's reply to an entry that has been sent. */
    resultOf: (id: string) => results.get(id),
    has: (id: string) => entries.some((e) => e.id === id),
    retry(id: string) {
      entries = entries.map((e) => (e.id === id ? { ...e, failed: undefined } : e));
      changed();
    },
    discard(id: string) {
      entries = entries.filter((e) => e.id !== id);
      changed();
    },
    subscribe(listener: (sent: boolean) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;

const asList = (v: Record<string, unknown> | Record<string, unknown>[]) => (Array.isArray(v) ? v : [v]);

const matches = (row: Record<string, unknown>, match: Record<string, string>) =>
  Object.entries(match).every(([k, v]) => String(row[k]) === v);

/**
 * Rows as they will be once waiting entries have been sent: inserts added (unless the server already
 * has them), updates applied, deletes removed. `keep` limits it to the rows the screen is showing.
 */
export function applyPending<T extends Record<string, unknown>>(
  rows: T[],
  entries: readonly OutboxEntry[],
  table: string,
  keep: (row: Record<string, unknown>) => boolean = () => true
): T[] {
  let out = rows;
  for (const { op, failed } of entries) {
    if (failed || op.kind === 'rpc' || op.table !== table) continue;
    if (op.kind === 'insert') {
      const added = asList(op.values).filter((v) => keep(v) && !out.some((r) => r.id === v.id));
      if (added.length) out = [...out, ...(added as T[])];
    } else if (op.kind === 'delete') {
      out = out.filter((r) => !matches(r, op.match));
    } else if (op.kind === 'update') {
      out = out.map((r) => (matches(r, op.match) ? { ...r, ...op.values } : r));
    } else if (keep(op.values)) {
      const keys = op.onConflict.split(',');
      const same = (r: Record<string, unknown>) => keys.every((k) => k === 'user_id' || String(r[k]) === String(op.values[k]));
      out = out.some(same) ? out.map((r) => (same(r) ? { ...r, ...op.values } : r)) : [...out, op.values as T];
    }
  }
  return out;
}
