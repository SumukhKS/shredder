import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase config. Copy .env.example to .env and set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
  );
}

// RPCs that only read; calling them doesn't make anything on screen stale.
const READ_RPCS = new Set(['previous_sets', 'exercise_bests', 'exercise_set_history', 'profile_stats', 'search_foods', 'public_profile']);
let writes = 0;

/** Goes up whenever the app writes to the database, so screens know their data may be out of date (see `useQuery`). */
export function dataVersion() {
  return writes;
}

/** Counts database writes (anything but a read or a read-only RPC) on the way out. */
const countingFetch: typeof fetch = (input, init) => {
  const method = (init?.method ?? 'GET').toUpperCase();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (method !== 'GET' && method !== 'HEAD' && url.includes('/rest/v1/')) {
    const rpc = url.match(/\/rest\/v1\/rpc\/([^?/]+)/)?.[1];
    if (!rpc || !READ_RPCS.has(rpc)) writes++;
  }
  return fetch(input, init);
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: { fetch: countingFetch },
});

// Refresh tokens only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
