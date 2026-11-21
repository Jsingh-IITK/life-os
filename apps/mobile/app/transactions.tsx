import { Money } from '@life-os/finance-core';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ErrorState,
  ListRow,
  LoadingState,
  Screen,
  Text,
} from '@/components/ui';
import { space } from '@/design/tokens';
import { useTransactionHistory } from '@/lib/queries/transactions';

/** Fallback titles for entries with no merchant or category. */
const TYPE_LABELS: Partial<Record<string, string>> = {
  transfer: 'Transfer',
  cc_repayment: 'Card repayment',
  investment_buy: 'Investment purchase',
  investment_sell: 'Investment redemption',
  opening_balance: 'Opening balance',
  adjustment: 'Adjustment',
};

export default function TransactionHistoryScreen() {
  const router = useRouter();
  const history = useTransactionHistory();

  const rows = useMemo(() => history.data?.pages.flat() ?? [], [history.data]);

  // Grouped by day, so the list reads as a diary rather than a ledger dump.
  const groups = useMemo(() => {
    const byDate = new Map<string, typeof rows>();
    for (const row of rows) {
      const existing = byDate.get(row.date);
      if (existing) existing.push(row);
      else byDate.set(row.date, [row]);
    }
    return [...byDate.entries()];
  }, [rows]);

  if (history.isPending) {
    return (
      <Screen eyebrow="FINANCE" title="All transactions">
        <LoadingState label="Loading history…" />
      </Screen>
    );
  }

  if (history.isError) {
    return (
      <Screen eyebrow="FINANCE" title="All transactions">
        <ErrorState message={history.error.message} onRetry={() => void history.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow="FINANCE"
      title="All transactions"
      subtitle={rows.length === 0 ? undefined : `${rows.length} loaded, newest first`}>
      {rows.length === 0 ? (
        <Card style={styles.empty}>
          <Text variant="cardHeading">Nothing recorded yet</Text>
          <Text variant="secondary" color="textSecondary">
            Transactions you add will appear here, grouped by day.
          </Text>
          <Button label="Add a transaction" onPress={() => router.push('/transaction/new')} />
        </Card>
      ) : (
        groups.map(([date, items]) => (
          <Card key={date} style={styles.group}>
            <Text variant="caption" color="textMuted" style={styles.dayLabel}>
              {formatDay(date)}
            </Text>
            {items.map((t, i) => (
              <ListRow
                key={t.id}
                onPress={() => router.push(`/transaction/${t.id}`)}
                title={t.merchant || t.categoryName || TYPE_LABELS[t.type] || t.type}
                meta={t.categoryName ?? undefined}
                amount={
                  (t.direction === 'in' ? '+' : t.direction === 'out' ? '−' : '') +
                  Money.formatINR(t.amount)
                }
                amountTone={t.direction === 'in' ? 'success' : 'textPrimary'}
                last={i === items.length - 1}
              />
            ))}
          </Card>
        ))
      )}

      {history.hasNextPage ? (
        <View style={styles.more}>
          <Button
            label={history.isFetchingNextPage ? 'Loading…' : 'Load older'}
            variant="secondary"
            loading={history.isFetchingNextPage}
            onPress={() => void history.fetchNextPage()}
          />
        </View>
      ) : rows.length > 0 ? (
        <Text variant="caption" color="textMuted" align="center">
          That's everything.
        </Text>
      ) : null}
    </Screen>
  );
}

/** "Today", "Yesterday", or a written date. */
function formatDay(iso: string): string {
  // Parsed as local parts, not via Date(iso) — that treats a bare date as UTC
  // and shifts it a day backwards in any positive-offset timezone.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((startOfToday.getTime() - date.getTime()) / 86_400_000);

  if (days === 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  return date
    .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' })
    .toUpperCase();
}

const styles = StyleSheet.create({
  empty: { gap: space[3], alignItems: 'flex-start' },
  group: { gap: 0 },
  dayLabel: { marginBottom: space[2], letterSpacing: 0.6 },
  more: { alignItems: 'center' },
});
