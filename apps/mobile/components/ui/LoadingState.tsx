import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const colors = useColors();
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <ActivityIndicator size="small" color={colors.brandPrimary} />
        <Text variant="secondary" color="textSecondary">
          {label}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space[8], alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
