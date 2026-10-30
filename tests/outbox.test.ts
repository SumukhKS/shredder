import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyPending,
  classify,
  createOutbox,
  newId,
  type OutboxEntry,
  type OutboxOp,
  type Sender,
} from '../src/lib/outbox-core';

function setup(send: Sender, saved: OutboxEntry[] = []) {
  const store = {
    saved,
    load: () => saved,
    save(e: OutboxEntry[]) {
      store.saved = JSON.parse(JSON.stringify(e));
    },
  };
  let time = 1000;
  const box = createOutbox(store, send, { now: () => time, timeoutMs: 30 });
  return { box, store, advance: (ms: number) => (time += ms) };
}

const water = (id: string): OutboxOp => ({ kind: 'insert', table: 'water_logs', values: { id, day: '2026-01-01', ml: 250 } });
const offline = { error: { message: 'TypeError: Network request failed' } };

test('errors sort into done, retry, login and refused', () => {
  const op = water('a');
  assert.equal(classify(null, op), 'ok');
  assert.equal(classify({ message: 'TypeError: Network request failed', code: '' }, op), 'retry');
  assert.equal(classify({ message: 'bad gateway', status: 502 }, op), 'retry');
  assert.equal(classify({ message: 'slow down', status: 429 }, op), 'retry');
  assert.equal(classify({ code: 'PGRST301', message: 'JWT expired' }, op), 'login');
  assert.equal(classify({ code: 'P0001', message: 'not authenticated' }, op), 'login');
  assert.equal(classify({ code: '23505', message: 'duplicate' }, op), 'ok');
  assert.equal(classify({ code: '23505', message: 'duplicate' }, { kind: 'rpc', name: 'x', args: {} }), 'refused');
  assert.equal(classify({ code: '23514', message: 'check violation' }, op), 'refused');
  assert.equal(classify({ code: '23503', message: 'deleted exercise' }, op), 'refused');
  assert.equal(classify({ code: '22P02', message: 'bad uuid' }, op), 'refused');
});

test('entries are stored before sending and survive a restart', async () => {
  const { box, store } = setup(async () => offline);
  box.add(water('a'));
  assert.equal(store.saved.length, 1);
  await box.flush(true);
  assert.equal(store.saved.length, 1);
  const restarted = setup(async () => ({}), store.saved);
  await restarted.box.flush(true);
  assert.equal(restarted.box.list().length, 0);
  assert.equal(restarted.store.saved.length, 0);
});

test('entries go in order and the first failure stops the rest', async () => {
  const sent: string[] = [];
  let online = false;
  const { box } = setup(async (op) => {
    if (!online) return offline;
    sent.push((op as { values: { id: string } }).values.id);
    return {};
  });
  box.add(water('a'));
  box.add(water('b'));
  await box.flush(true);
  assert.deepEqual(sent, []);
  assert.equal(box.list()[1].attempts, 0, 'the second was not tried');
  online = true;
  await box.flush(true);
  assert.deepEqual(sent, ['a', 'b']);
});

test('a refused entry is kept for the user and does not block the rest', async () => {
  const sent: string[] = [];
  const { box } = setup(async (op) => {
    const id = (op as { values: { id: string } }).values.id;
    if (id === 'bad') return { error: { code: '23514', message: 'too high' } };
    sent.push(id);
    return {};
  });
  box.add(water('bad'));
  box.add(water('good'));
  await box.flush(true);
  assert.deepEqual(sent, ['good']);
  assert.equal(box.refused().length, 1);
  assert.equal(box.refused()[0].failed, 'too high');
  assert.equal(box.pending().length, 0);
});

test('a dropped reply is safe: the retry sees the row exists and finishes', async () => {
  let calls = 0;
  const { box } = setup(async () => (++calls === 1 ? offline : { error: { code: '23505', message: 'duplicate key' } }));
  box.add(water('a'));
  await box.flush(true);
  assert.equal(box.list().length, 1);
  await box.flush(true);
  assert.equal(box.list().length, 0);
});

test('a hung request times out and waits, and an expired login holds entries', async () => {
  const hung = setup(() => new Promise(() => {}));
  hung.box.add(water('a'));
  await hung.box.flush(true);
  assert.equal(hung.box.pending().length, 1);

  const expired = setup(async () => ({ error: { status: 401, message: 'JWT expired' } }));
  expired.box.add(water('a'));
  await expired.box.flush(true);
  assert.equal(expired.box.pending().length, 1);
  assert.equal(expired.box.refused().length, 0);
});

test('retries back off, and forcing skips the wait', async () => {
  let calls = 0;
  const { box, advance } = setup(async () => {
    calls++;
    return offline;
  });
  box.add(water('a'));
  await box.flush();
  assert.equal(calls, 1);
  await box.flush();
  assert.equal(calls, 1, 'held off');
  advance(5001);
  await box.flush();
  assert.equal(calls, 2);
  await box.flush(true);
  assert.equal(calls, 3);
});

test('an entry added during a send still goes, once each', async () => {
  const sent: string[] = [];
  const { box } = setup(async (op) => {
    const id = (op as { values: { id: string } }).values.id;
    sent.push(id);
    if (id === 'a') box.add(water('b'));
    return {};
  });
  box.add(water('a'));
  await Promise.all([box.flush(true), box.flush(true)]);
  assert.deepEqual(sent, ['a', 'b']);
});

test('applyPending shows waiting changes without counting anything twice', () => {
  const rows = [{ id: 'server', day: '2026-01-01', ml: 500 }];
  const entry = (op: OutboxOp, failed?: string): OutboxEntry => ({ id: newId(), op, createdAt: '', attempts: 0, failed });
  const sameDay = (r: Record<string, unknown>) => r.day === '2026-01-01';

  assert.equal(applyPending(rows, [entry(water('new'))], 'water_logs', sameDay).length, 2);
  assert.equal(applyPending(rows, [entry(water('server'))], 'water_logs', sameDay).length, 1, 'already on the server');
  assert.equal(applyPending(rows, [entry({ ...water('new'), table: 'food_logs' })], 'water_logs').length, 1, 'other table');
  assert.equal(applyPending(rows, [entry(water('new'), 'refused')], 'water_logs').length, 1, 'refused entries are not shown');
  assert.equal(
    applyPending(
      rows,
      [entry({ kind: 'insert', table: 'water_logs', values: { id: 'x', day: '2026-01-02', ml: 1 } })],
      'water_logs',
      sameDay
    ).length,
    1,
    'another day'
  );
  assert.equal(
    applyPending(rows, [entry({ kind: 'delete', table: 'water_logs', match: { id: 'server' } })], 'water_logs').length,
    0
  );
  // Setting a day's total: everything goes, then the new row, in order.
  const replaced = applyPending(
    rows,
    [entry({ kind: 'delete', table: 'water_logs', match: { day: '2026-01-01' } }), entry(water('new'))],
    'water_logs',
    sameDay
  );
  assert.deepEqual(
    replaced.map((r) => r.id),
    ['new']
  );
  // Measurements merge by day and keep the other values.
  const metric = [{ day: '2026-01-01', weight_kg: 80, waist_cm: 90 }];
  const merged = applyPending(
    metric,
    [
      entry({
        kind: 'upsert',
        table: 'body_metrics',
        onConflict: 'user_id,day',
        values: { user_id: 'u', day: '2026-01-01', weight_kg: 79 },
      }),
    ],
    'body_metrics'
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].weight_kg, 79);
  assert.equal(merged[0].waist_cm, 90);
});

test('newId makes valid, different ids', () => {
  const ids = new Set(Array.from({ length: 2000 }, newId));
  assert.equal(ids.size, 2000);
  for (const id of [...ids].slice(0, 50))
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
