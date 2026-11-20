import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { space } from '@/design/tokens';

/**
 * Shown when a query fails. Surfaces the real message rather than a generic
 * apology: "could not reach the server" and "row level security denied this"
 * need different reactions from the user.
 */
export function ErrorState({
  title = 'Could not load this',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card style={styles.card}>
      <Text variant="cardHeading" color="danger">
        {title}
      </Text>
      <Text variant="secondary" color="textSecondary">
        {message}
      </Text>
      {onRetry ? <Button label="Try again" variant="secondary" size="small" onPress={onRetry} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[2], alignItems: 'flex-start' },
});
