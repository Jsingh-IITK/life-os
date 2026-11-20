import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

/**
 * The Supabase browser/device client.
 *
 * Only the URL and the anon key live here. Both are publishable by design —
 * the anon key carries no privileges of its own, and every table is guarded by
 * RLS, so what it can reach is determined entirely by the signed-in user's JWT.
 *
 * The service role key must never appear in this app. It bypasses RLS, and
 * anything in the client bundle is readable by anyone who installs the app.
 * It belongs in Supabase Edge Function secrets and nowhere else.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill both in.',
  );
}

// On native there is no URL bar to read a session back from, and enabling
// detection there makes the client wait on a redirect that never arrives.
const isWeb = Platform.OS === 'web';

export const supabase = createClient(url, anonKey, {
  auth: {
    // AsyncStorage on device; on web the client's default (localStorage) is
    // correct, and handing it AsyncStorage would break SSR during export.
    ...(isWeb ? {} : { storage: AsyncStorage }),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: isWeb,
  },
});
