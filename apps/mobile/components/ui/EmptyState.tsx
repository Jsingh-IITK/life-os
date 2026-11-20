import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { space } from '@/design/tokens';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Used wherever there is genuinely no data yet. Saying so plainly is better
 * than filling the screen with sample figures that look real.
 */
export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Card variant="empty" style={styles.card}>
      <Text variant="cardHeading">{title}</Text>
      <Text variant="secondary" color="textSecondary" align="center" style={styles.description}>
        {description}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" size="small" />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: space[3], paddingVertical: space[8] },
  description: { maxWidth: 420 },
});
