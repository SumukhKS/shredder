import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { onEntrySent, useOutboxVersion } from '@/lib/outbox';
import { dataVersion } from '@/lib/supabase';

/** Data older than this is fetched again when its screen comes back into view, even if nothing was written. */
const STALE_MS = 5 * 60_000;

// Last data per cached query: in memory for tab switches, and on the device so a cold start shows
// the previous screen straight away while the network catches up.
// Bump the version when a cached screen's data changes shape.
const PREFIX = 'shredder.q2.';
const INDEX = 'shredder.q2.index';
const memory = new Map<string, unknown>();

function readCache<T>(id: string): T | null {
  if (memory.has(id)) return memory.get(id) as T;
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (raw == null) return null;
    const v = JSON.parse(raw) as T;
    memory.set(id, v);
    return v;
  } catch {
    return null;
  }
}

function writeCache(id: string, value: unknown) {
  memory.set(id, value);
  // Off the render path: the write is a synchronous SQLite call.
  setTimeout(() => {
    try {
      localStorage.setItem(PREFIX + id, JSON.stringify(value));
      const index = new Set<string>(JSON.parse(localStorage.getItem(INDEX) ?? '[]'));
      if (!index.has(id)) localStorage.setItem(INDEX, JSON.stringify([...index, id]));
    } catch {}
  }, 0);
}

/** Forget every cached screen (on sign-out, so the next account never sees them). */
export function clearQueryCache() {
  memory.clear();
  try {
    for (const id of JSON.parse(localStorage.getItem(INDEX) ?? '[]') as string[]) localStorage.removeItem(PREFIX + id);
    localStorage.removeItem(INDEX);
  } catch {}
}

/**
 * Tiny data hook: loads on first focus and whenever `key` changes, and exposes
 * reload/refresh for pull-to-refresh and after mutations. Coming back to a screen
 * only refetches when the app has written something since (see `dataVersion`) or the
 * data is more than a few minutes old, so switching tabs doesn't hit the network.
 * Keeps the previous data while reloading so screens don't flash.
 *
 * With `cache` (a name unique to the screen's query; the data must be plain JSON), the last
 * result for that name and key is shown immediately, then refreshed.
 *
 * With `overlay`, entries still waiting to be sent are applied to whatever was last loaded, so what
 * was logged offline shows straight away, and the screen reloads once they reach the server.
 */
export function useQuery<T>(
  load: () => Promise<T>,
  key: string | number = '',
  options: { cache?: string; overlay?: (data: T) => T } = {}
) {
  const cacheId = options.cache ? `${options.cache}|${key}` : null;
  const [data, setData] = useState<T | null>(() => (cacheId ? readCache<T>(cacheId) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(data == null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  // What the data on screen was loaded for: key, write count and time.
  const loaded = useRef<{ key: string | number; version: number; at: number } | null>(null);

  // Always call the latest loader (it closes over the current key/params).
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(
    async (isRefresh: boolean, forKey: string | number) => {
      if (isRefresh) setRefreshing(true);
      const version = dataVersion();
      try {
        const next = await loadRef.current();
        setData(next);
        setError(null);
        loaded.current = { key: forKey, version, at: Date.now() };
        if (options.cache) writeCache(`${options.cache}|${forKey}`, next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load data.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [options.cache]
  );

  // A new key starts from that key's cached data (or nothing) rather than the old key's.
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    const cached = cacheId ? readCache<T>(cacheId) : null;
    if (cached != null) setData(cached);
  }

  useFocusEffect(
    useCallback(() => {
      const last = loaded.current;
      const fresh = last && last.key === key && last.version === dataVersion() && Date.now() - last.at < STALE_MS;
      if (!fresh) run(false, key);
    }, [run, key])
  );

  const overlaid = !!options.overlay;
  useEffect(() => {
    if (!overlaid) return;
    return onEntrySent(() => run(false, key));
  }, [overlaid, run, key]);
  useOutboxVersion();

  return {
    data: data != null && options.overlay ? options.overlay(data) : data,
    error,
    loading,
    refreshing,
    reload: () => run(false, key),
    refresh: () => run(true, key),
    setData,
  };
}
