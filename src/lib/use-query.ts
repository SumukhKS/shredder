import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Tiny data hook: loads on focus and whenever `key` changes, and exposes
 * reload/refresh for pull-to-refresh and after mutations. Keeps the previous
 * data while reloading so screens don't flash.
 */
export function useQuery<T>(load: () => Promise<T>, key: string | number = '') {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);

  // Always call the latest loader (it closes over the current key/params).
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (key !== null) run(false);
    }, [run, key])
  );

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => run(false),
    refresh: () => run(true),
    setData,
  };
}
