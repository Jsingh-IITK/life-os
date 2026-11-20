import { StyleSheet, View } from 'react-native';

import { Card, EmptyState, Screen, Text } from '@/components/ui';
import { useLayout } from '@/design/theme';
import { space } from '@/design/tokens';
import { useSession } from '@/lib/auth/session';

/**
 * Home.
 *
 * Deliberately shows empty states rather than the sample figures from the
 * design board. There is no financial or training data yet, and the handoff is
 * explicit that illustrative mockup metrics must not be presented as real.
 */
export default function HomeScreen() {
  const { session } = useSession();
  const { isMobile } = useLayout();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = session?.user.email?.split('@')[0] ?? 'there';

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Screen title={`${greeting}, ${name}`} subtitle={today}>
      <View style={[styles.grid, isMobile ? styles.gridMobile : null]}>
        <Card style={styles.half}>
          <Text variant="cardHeading">Finance</Text>
          <Text variant="secondary" color="textSecondary">
            Net worth, spending and budgets appear here once you add an account.
          </Text>
        </Card>

        <Card style={styles.half}>
          <Text variant="cardHeading">Fitness</Text>
          <Text variant="secondary" color="textSecondary">
            Your training schedule and recent sessions appear here once the
            module is built.
          </Text>
        </Card>
      </View>

      <EmptyState
        title="Nothing to show yet"
        description="Your account is set up and secured, but there is no financial or training data in it. Accounts and transactions arrive in the next milestone."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: space[4] },
  gridMobile: { flexDirection: 'column' },
  half: { flex: 1, gap: space[2], minWidth: 220 },
});
