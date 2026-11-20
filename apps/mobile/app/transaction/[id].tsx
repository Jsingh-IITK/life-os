import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TransactionForm } from '@/components/finance/TransactionForm';
import { Button, Card, ErrorState, LoadingState, Text } from '@/components/ui';
import { space } from '@/design/tokens';
import { useDeleteTransaction, useTransaction } from '@/lib/queries/transactions';

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const transaction = useTransaction(id);
  const remove = useDeleteTransaction();
  const [confirming, setConfirming] = useState(false);

  if (transaction.isPending) return <LoadingState label="Loading transaction…" />;
  if (transaction.isError) {
    return (
      <ErrorState message={transaction.error.message} onRetry={() => void transaction.refetch()} />
    );
  }

  return (
    <View style={styles.wrap}>
      <TransactionForm
        existingId={id}
        initial={transaction.data}
        onDone={() => router.back()}
      />

      <View style={styles.danger}>
        <Card style={styles.dangerCard}>
          {confirming ? (
            <>
              <Text variant="cardHeading">Delete this transaction?</Text>
              {/* Honest about what delete means here: the entry stops counting
                  but the record survives, so this is reversible. */}
              <Text variant="secondary" color="textSecondary">
                It stops counting towards balances and budgets immediately. The
                record is kept, so it can be restored.
              </Text>
              {remove.isError ? (
                <Text variant="secondary" color="danger">
                  {remove.error.message}
                </Text>
              ) : null}
              <View style={styles.row}>
                <Button
                  label={remove.isPending ? 'Deleting…' : 'Yes, delete'}
                  variant="destructive"
                  loading={remove.isPending}
                  onPress={() => {
                    remove.mutate(id, { onSuccess: () => router.back() });
                  }}
                />
                <Button label="Keep it" variant="ghost" onPress={() => setConfirming(false)} />
              </View>
            </>
          ) : (
            <Button
              label="Delete transaction"
              variant="destructive"
              size="small"
              onPress={() => setConfirming(true)}
            />
          )}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  danger: { paddingHorizontal: space[5], paddingBottom: space[8], alignItems: 'center' },
  dangerCard: { width: '100%', maxWidth: 520, gap: space[3], alignItems: 'flex-start' },
  row: { flexDirection: 'row', gap: space[3], alignItems: 'center' },
});
