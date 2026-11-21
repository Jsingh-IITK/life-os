import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, Text } from '@/components/ui';
import { useTheme, type ThemeMode } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { useRouter } from 'expo-router';

import { useSession } from '@/lib/auth/session';
import { supabase } from '@/lib/supabase';

const MODES: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Follow your device' },
  { value: 'light', label: 'Light', hint: 'Warm ivory' },
  { value: 'dark', label: 'Dark', hint: 'Charcoal' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { mode, scheme, setMode, colors } = useTheme();

  return (
    <Screen title="Settings" subtitle="Account, appearance and preferences.">
      <Card style={styles.section}>
        <Text variant="cardHeading">Appearance</Text>
        <Text variant="secondary" color="textSecondary">
          Applies immediately and is remembered on this device.
        </Text>

        <View style={styles.modes} accessibilityRole="radiogroup">
          {MODES.map((option) => {
            const selected = mode === option.value;
            return (
              <View
                key={option.value}
                style={[
                  styles.mode,
                  {
                    borderColor: selected ? colors.brandPrimary : colors.borderPrimary,
                    backgroundColor: selected ? colors.brandSubtle : 'transparent',
                    // Two-pixel border on the selected option, so selection is
                    // not signalled by colour alone.
                    borderWidth: selected ? 2 : 1,
                  },
                ]}>
                <Button
                  label={option.label}
                  variant="ghost"
                  size="small"
                  onPress={() => setMode(option.value)}
                  accessibilityLabel={`${option.label} theme${selected ? ', selected' : ''}`}
                />
                <Text variant="caption" color="textMuted">
                  {option.hint}
                </Text>
              </View>
            );
          })}
        </View>

        <Text variant="caption" color="textMuted">
          Currently showing the {scheme} theme.
        </Text>
      </Card>

      <Card style={styles.section}>
        <Text variant="cardHeading">Account</Text>
        <Text variant="body" color="textSecondary">
          {session?.user.email ?? 'Not signed in'}
        </Text>
        <View style={styles.badges}>
          <Badge label="Finance" tone="brand" />
          <Badge label="Fitness" tone="brand" />
          <Badge label="Routines — coming soon" />
          <Badge label="Journal — coming soon" />
        </View>
        <Button
          label="Sign out"
          variant="destructive"
          size="medium"
          onPress={() => void supabase.auth.signOut()}
          style={styles.signOut}
        />
      </Card>

      <Card style={styles.section}>
        <Text variant="cardHeading">Accounts & categories</Text>
        <Text variant="secondary" color="textSecondary">
          Add, rename or archive your accounts, cards and spending categories,
          and set opening balances.
        </Text>
        <Button
          label="Manage"
          variant="secondary"
          size="small"
          onPress={() => router.push('/accounts')}
          style={styles.signOut}
        />
      </Card>

      <Card style={styles.section}>
        <Text variant="cardHeading">Preferences</Text>
        <Text variant="secondary" color="textSecondary">
          Currency and timezone are stored against your account. Editing them
          from here arrives next.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[3] },
  modes: { flexDirection: 'row', gap: space[3], flexWrap: 'wrap' },
  mode: {
    borderRadius: radius.md,
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    alignItems: 'center',
    gap: space[1],
    minWidth: 110,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  signOut: { alignSelf: 'flex-start' },
});
