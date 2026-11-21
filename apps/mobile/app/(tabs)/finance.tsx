import { Money } from '@life-os/finance-core';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ErrorState,
  Grid,
  ListRow,
  LoadingState,
  Pill,
  SampleNotice,
  Screen,
  SectionHead,
  Text,
} from '@/components/ui';
import { space } from '@/design/tokens';
import { useTransactions } from '@/lib/queries/transactions';
import {
  netWorth,
  totalFor,
  useAccountBalances,
  useHasChartOfAccounts,
  useOnboard,
  type AccountBalance,
} from '@/lib/queries/accounts';

/** Fallback titles for transactions with no merchant or category. */
const TYPE_LABELS: Partial<Record<string, string>> = {
  transfer: 'Transfer',
  cc_repayment: 'Card repayment',
  investment_buy: 'Investment purchase',
  investment_sell: 'Investment redemption',
  opening_balance: 'Opening balance',
  adjustment: 'Adjustment',
};

export default function FinanceScreen() {
  const router = useRouter();
  const accounts = useHasChartOfAccounts();
  const balances = useAccountBalances();
  const transactions = useTransactions(8);
  const onboard = useOnboard();

  if (accounts.isPending) {
    return (
      <Screen eyebrow="FINANCE" title="Make your money make sense.">
        <LoadingState label="Loading your accounts…" />
      </Screen>
    );
  }

  if (accounts.isError) {
    return (
      <Screen eyebrow="FINANCE" title="Make your money make sense.">
        <ErrorState message={accounts.error.message} onRetry={() => void accounts.refetch()} />
      </Screen>
    );
  }

  // No chart of accounts yet. Rather than showing sample figures, offer the
  // one action that makes the rest of this screen possible.
  if ((accounts.data?.length ?? 0) === 0) {
    return (
      <Screen eyebrow="FINANCE" title="Make your money make sense.">
        <Card style={styles.setup}>
          <Text variant="sectionHeading">Set up your accounts</Text>
          <Text variant="secondary" color="textSecondary" style={styles.setupBody}>
            This creates your chart of accounts: a bank account, a credit card,
            investment holdings, and the expense categories from your plan.
            Nothing is posted — every balance starts at zero and builds from
            the transactions you record.
          </Text>

          {onboard.isError ? (
            <Text variant="secondary" color="danger">
              {onboard.error.message}
            </Text>
          ) : null}

          <Button
            label={onboard.isPending ? 'Creating accounts…' : 'Create my accounts'}
            loading={onboard.isPending}
            onPress={() => onboard.mutate({ bankName: 'Savings account' })}
          />
        </Card>
      </Screen>
    );
  }

  const rows = balances.data ?? [];
  const assets = totalFor(rows, 'ASSET');
  const liabilities = totalFor(rows, 'LIABILITY');
  const spend = totalFor(rows, 'EXPENSE');
  const income = totalFor(rows, 'INCOME');
  const worth = netWorth(rows);

  const cashAccounts = rows
    .filter((r) => r.accountClass === 'ASSET' || r.accountClass === 'LIABILITY')
    .sort((a, b) => Money.compare(b.balance, a.balance));

  const spendByCategory = rows
    .filter((r) => r.accountClass === 'EXPENSE' && !Money.isZero(r.balance))
    .sort((a, b) => Money.compare(b.balance, a.balance));

  const hasActivity = !Money.isZero(spend) || !Money.isZero(income);

  return (
    <Screen eyebrow="FINANCE" title="Make your money make sense.">
      {/* Figures below are real — derived from the ledger, not placeholders.
          The notice only appears while there is nothing recorded yet. */}
      {!hasActivity ? (
        <SampleNotice text="Your accounts are ready. These figures stay at zero until you record a transaction." />
      ) : null}

      <Grid columns={4}>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Net worth</Text>
          <Text variant="metric" tabular style={styles.metric}>{Money.formatINR(worth)}</Text>
          <Text variant="caption" color="textSecondary">Assets minus liabilities</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Total assets</Text>
          <Text variant="metric" tabular style={styles.metric}>{Money.formatINR(assets)}</Text>
          <Text variant="caption" color="textSecondary">{cashAccounts.length} accounts tracked</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Owed</Text>
          <Text variant="metric" tabular style={styles.metric}>{Money.formatINR(liabilities)}</Text>
          <Text variant="caption" color="textSecondary">Card and loan balances</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Spent so far</Text>
          <Text variant="metric" tabular style={styles.metric}>{Money.formatINR(spend)}</Text>
          {/* Transfers, card repayments and investments are excluded
              structurally — they post no expense leg. */}
          <Text variant="caption" color="textSecondary">Excludes transfers and investments</Text>
        </Card>
      </Grid>

      <View style={styles.toolbar}>
        <Button label="＋ Add transaction" onPress={() => router.push('/transaction/new')} />
      </View>

      <Grid columns={2}>
        <Card style={styles.panel}>
          <SectionHead
            title="Accounts"
            subtitle="Balances derived from the ledger"
            trailing={<Pill label={`${cashAccounts.length}`} />}
          />
          {balances.isPending ? (
            <LoadingState label="Calculating balances…" />
          ) : balances.isError ? (
            <ErrorState message={balances.error.message} onRetry={() => void balances.refetch()} />
          ) : (
            cashAccounts.map((a, i) => (
              <AccountRow key={a.id} account={a} last={i === cashAccounts.length - 1} />
            ))
          )}
        </Card>

        <Card style={styles.panel}>
          <SectionHead
            title="Recent transactions"
            subtitle="Newest first"
            trailing={
              <Button
                label="View all →"
                variant="ghost"
                size="small"
                onPress={() => router.push('/transactions')}
              />
            }
          />
          {transactions.isPending ? (
            <LoadingState label="Loading transactions…" />
          ) : transactions.isError ? (
            <ErrorState message={transactions.error.message} onRetry={() => void transactions.refetch()} />
          ) : (transactions.data?.length ?? 0) === 0 ? (
            <Text variant="secondary" color="textSecondary" style={styles.empty}>
              Nothing recorded yet. Add your first transaction to see it here.
            </Text>
          ) : (
            (transactions.data ?? []).map((t, i) => (
              <ListRow
                key={t.id}
                onPress={() => router.push(`/transaction/${t.id}`)}
                title={t.merchant || t.categoryName || TYPE_LABELS[t.type] || t.type}
                meta={`${t.date}${t.categoryName ? ` · ${t.categoryName}` : ''}`}
                // Sign reflects how the money reads, not the ledger's
                // debit-positive convention. A transfer gets neither sign
                // because it is neither spent nor earned.
                amount={
                  (t.direction === 'in' ? '+' : t.direction === 'out' ? '−' : '') +
                  Money.formatINR(t.amount)
                }
                amountTone={t.direction === 'in' ? 'success' : 'textPrimary'}
                last={i === (transactions.data?.length ?? 0) - 1}
              />
            ))
          )}
        </Card>

        <Card style={styles.panel}>
          <SectionHead title="Spending by category" subtitle="This is everything recorded so far" />
          {spendByCategory.length === 0 ? (
            <Text variant="secondary" color="textSecondary" style={styles.empty}>
              Nothing recorded yet. Categories appear here as you add expenses.
            </Text>
          ) : (
            spendByCategory.map((c, i) => (
              <ListRow
                key={c.id}
                title={c.name}
                amount={Money.formatINR(c.balance)}
                last={i === spendByCategory.length - 1}
              />
            ))
          )}
        </Card>
      </Grid>
    </Screen>
  );
}

function AccountRow({ account, last }: { account: AccountBalance; last: boolean }) {
  const isLiability = account.accountClass === 'LIABILITY';
  return (
    <ListRow
      title={account.name}
      meta={isLiability ? 'Credit card · owed' : 'Asset'}
      amount={Money.formatINR(account.balance)}
      // Money owed is not a loss; it reads in the normal colour, with the
      // meaning carried by the label rather than by red text.
      amountTone="textPrimary"
      last={last}
    />
  );
}

const styles = StyleSheet.create({
  metricCard: { gap: space[1], minHeight: 112 },
  metric: { fontSize: 25, letterSpacing: -1, marginTop: space[1] },
  panel: { gap: 0 },
  setup: { gap: space[3], alignItems: 'flex-start', maxWidth: 560 },
  setupBody: { maxWidth: 520 },
  empty: { paddingVertical: space[5] },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end' },
});
