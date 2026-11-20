import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { space } from '@/design/tokens';

export interface MetricProps {
  label: string;
  /** Preformatted — formatting belongs to the core packages, not the UI. */
  value: string;
  /** Change indicator, e.g. "+6.8%". */
  delta?: string;
  deltaTone?: 'success' | 'danger' | 'textMuted';
  /**
   * Marks a derived figure. The PRD requires estimates be distinguishable from
   * actuals, so this renders as visible text rather than only a style change.
   */
  estimate?: boolean;
  footnote?: string;
}

export function Metric({ label, value, delta, deltaTone = 'textMuted', estimate, footnote }: MetricProps) {
  return (
    <Card variant="metric" style={styles.card}>
      <View style={styles.labelRow}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        {estimate ? (
          <Text variant="caption" color="textMuted">
            estimate
          </Text>
        ) : null}
      </View>

      <Text variant="metric" tabular>
        {value}
      </Text>

      {delta ? (
        <Text variant="caption" color={deltaTone} tabular>
          {delta}
        </Text>
      ) : null}

      {footnote ? (
        <Text variant="caption" color="textMuted">
          {footnote}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[2], flexGrow: 1, flexBasis: 200, minWidth: 160 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
});
