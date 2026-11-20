import { Pressable, StyleSheet } from 'react-native';

import { ModuleScreen, styles as shared } from '@/components/ModuleScreen';
import { Text } from '@/components/Themed';
import { useSession } from '@/lib/auth/session';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { session } = useSession();

  return (
    <ModuleScreen title="Settings" phase="Phase 1">
      <Text style={shared.row}>Signed in as {session?.user.email ?? 'unknown'}</Text>

      <Pressable
        onPress={() => void supabase.auth.signOut()}
        style={({ pressed }) => [local.signOut, { opacity: pressed ? 0.7 : 1 }]}>
        <Text style={local.signOutLabel}>Sign out</Text>
      </Pressable>

      <Text style={shared.caption}>
        Profile, preferences, currency, timezone and per-module settings land
        here. Every value is owned by the signed-in user — none of it is a
        global default.
      </Text>
    </ModuleScreen>
  );
}

const local = StyleSheet.create({
  signOut: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#d7263d',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  signOutLabel: { color: '#d7263d', fontWeight: '600' },
});
