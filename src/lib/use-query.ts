import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { dataVersion } from '@/lib/supabase';

/** Data older than this is fetched again when its screen comes back into view, even if nothing was written. */
const STALE_MS = 5 * 60_000;

/**
 * Tiny data hook: loads on first focus and whenever `key` changes, and exposes
 * reload/refresh for pull-to-refresh and after mutations. Coming back to a screen
 * only refetches when the app has written something since (see `dataVersion`) or the
 * data is more than a few minutes old, so switching tabs doesn't hit the network.
 * Keeps the previous data while reloading so screens don't flash.
 */
export function useQuery<T>(load: () => Promise<T>, key: string | number = '') {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  // What the data on screen was loaded for: key, write count and time.
  const loaded = useRef<{ key: string | number; version: number; at: number } | null>(null);

  // Always call the latest loader (it closes over the current key/params).
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(async (isRefresh: boolean, forKey: string | number) => {
    if (isRefresh) setRefreshing(true);
    const version = dataVersion();
    try {
      setData(await loadRef.current());
      setError(null);
      loaded.current = { key: forKey, version, at: Date.now() };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const last = loaded.current;
      const fresh = last && last.key === key && last.version === dataVersion() && Date.now() - last.at < STALE_MS;
      if (!fresh) run(false, key);
    }, [run, key])
  );

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => run(false, key),
    refresh: () => run(true, key),
    setData,
  };
}
