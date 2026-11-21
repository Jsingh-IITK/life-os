import { Money } from '@life-os/finance-core';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Grid,
  ListRow,
  LoadingState,
  ProgressBar,
  Screen,
  SectionHead,
  Text,
} from '@/components/ui';
import { space } from '@/design/tokens';
import { netWorth, useAccountBalances, useHasChartOfAccounts } from '@/lib/queries/accounts';
import { monthKey, useBudget } from '@/lib/queries/budgets';
import { useMonthSummary } from '@/lib/queries/summary';
import { useTransactions } from '@/lib/queries/transactions';
import { useSession } from '@/lib/auth/session';

const TYPE_LABELS: Partial<Record<string, string>> = {
  transfer: 'Transfer',
  cc_repayment: 'Card repayment',
  investment_buy: 'Investment purchase',
  investment_sell: 'Investment redemption',
  opening_balance: 'Opening balance',
  adjustment: 'Adjustment',
};

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const month = monthKey();

  const accounts = useHasChartOfAccounts();
  const summary = useMonthSummary(month);
  const balances = useAccountBalances();
  const budget = useBudget(month);
  const recent = useTransactions(5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = session?.user.email?.split('@')[0] ?? 'there';
  const today = new Date()
    .toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();

  if (accounts.isPending || summary.isPending) {
    return (
      <Screen eyebrow={today} title={`${greeting}, ${name}`}>
        <LoadingState label="Loading your month…" />
      </Screen>
    );
  }

  if (summary.isError) {
    return (
      <Screen eyebrow={today} title={`${greeting}, ${name}`}>
        <ErrorState message={summary.error.message} onRetry={() => void summary.refetch()} />
      </Screen>
    );
  }

  // No chart of accounts means nothing can be recorded yet; say so plainly
  // rather than showing a wall of zeroes.
  if ((accounts.data?.length ?? 0) === 0) {
    return (
      <Screen eyebrow={today} title={`${greeting}, ${name}`}>
        <EmptyState
          title="Set up your accounts to begin"
          description="Life OS needs a chart of accounts before it can record anything. It takes one tap and posts no amounts — every balance starts at zero."
          actionLabel="Go to Finance"
          onAction={() => router.push('/finance')}
        />
      </Screen>
    );
  }

  const s = summary.data!;
  const worth = netWorth(balances.data ?? []);
  const budgetSummary = budget.data?.summary;
  const hasBudget = (budgetSummary?.allocations.length ?? 0) > 0;
  const rows = recent.data ?? [];

  return (
    <Screen eyebrow={today} title={`${greeting}, ${name}`}>
      <Grid columns={4}>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Income this month</Text>
          <Text variant="metric" tabular style={styles.metric}>{Money.formatINR(s.income)}</Text>
          <Text variant="caption" color="textSecondary">
            {Money.isZero(s.realizedGains) ? 'Earnings only' : `Plus ${Money.formatINR(s.realizedGains)} realized gains`}
          </Text>
        </Card>

        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Spent this month</Text>
          <Text variant="metric" tabular style={styles.metric}>{Money.formatINR(s.expenses)}</Text>
          <Text variant="caption" color="textSecondary">Excludes transfers and investments</Text>
        </Card>

        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Saved this month</Text>
          <Text
            variant="metric"
            tabular
            color={Money.isNegative(s.saved) ? 'danger' : 'textPrimary'}
            style={styles.metric}>
            {Money.formatINR(s.saved)}
          </Text>
          {/* A rate of 0% would claim you saved nothing; "no income yet" is a
              different statement, so it is said differently. */}
          <Text variant="caption" color="textSecondary">
            {s.savingsRate === null
              ? 'No income recorded yet'
              : `${Math.round(s.savingsRate * 100)}% of income`}
          </Text>
        </Card>

        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Net worth</Text>
          <Text variant="metric" tabular style={styles.metric}>{Money.formatINR(worth)}</Text>
          <Text variant="caption" color="textSecondary">Assets minus liabilities</Text>
        </Card>
      </Grid>

      <Grid columns={2}>
        <Card style={styles.panel}>
          <SectionHead
            title="Budget"
            subtitle={hasBudget ? 'Where this month stands' : 'Not set for this month'}
            trailing={
              <Button
                label={hasBudget ? 'Open →' : 'Set one up'}
                variant="ghost"
                size="small"
                onPress={() => router.push('/budget')}
              />
            }
          />
          {hasBudget && budgetSummary ? (
            <View style={styles.budget}>
              <ProgressBar
                value={budgetSummary.utilisation}
                label="Overall"
                detail={`${Money.formatINR(budgetSummary.totalActual)} / ${Money.formatINR(budgetSummary.totalPlanned)}`}
                tone={
                  budgetSummary.utilisation > 1
                    ? 'danger'
                    : budgetSummary.utilisation >= 0.85
                      ? 'warning'
                      : 'brand'
                }
              />
              {budgetSummary.overCategories.length > 0 ? (
                <Text variant="caption" color="danger">
                  Over in {budgetSummary.overCategories.map((c) => c.categoryName).join(', ')}.
                </Text>
              ) : (
                <Text variant="caption" color="textSecondary">
                  {Money.formatINR(budgetSummary.totalRemaining)} left to spend.
                </Text>
              )}
            </View>
          ) : (
            <Text variant="secondary" color="textSecondary" style={styles.quiet}>
              Set a monthly budget to see how your spending compares to the plan.
            </Text>
          )}
        </Card>

        <Card style={styles.panel}>
          <SectionHead
            title="Fitness"
            subtitle="Not built yet"
            trailing={<Button label="Open →" variant="ghost" size="small" onPress={() => router.push('/fitness')} />}
          />
          {/* No fitness schema exists, so there is nothing to report. Saying
              so beats inventing a streak. */}
          <Text variant="secondary" color="textSecondary" style={styles.quiet}>
            Training plans and workout logging arrive after Finance is
            complete. Nothing is tracked yet.
          </Text>
        </Card>
      </Grid>

      <Card style={styles.panel}>
        <SectionHead
          title="Recent activity"
          subtitle={s.transactionCount === 0 ? undefined : `${s.transactionCount} this month`}
          trailing={
            <Button label="See all →" variant="ghost" size="small" onPress={() => router.push('/transactions')} />
          }
        />
        {rows.length === 0 ? (
          <View style={styles.firstRun}>
            <Text variant="secondary" color="textSecondary">
              Nothing recorded yet. Your first transaction will appear here.
            </Text>
            <Button label="Add a transaction" size="small" onPress={() => router.push('/transaction/new')} />
          </View>
        ) : (
          rows.map((t, i) => (
            <ListRow
              key={t.id}
              onPress={() => router.push(`/transaction/${t.id}`)}
              title={t.merchant || t.categoryName || TYPE_LABELS[t.type] || t.type}
              meta={`${t.date}${t.categoryName ? ` · ${t.categoryName}` : ''}`}
              amount={
                (t.direction === 'in' ? '+' : t.direction === 'out' ? '−' : '') +
                Money.formatINR(t.amount)
              }
              amountTone={t.direction === 'in' ? 'success' : 'textPrimary'}
              last={i === rows.length - 1}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metricCard: { gap: space[1], minHeight: 112 },
  metric: { fontSize: 25, letterSpacing: -1, marginTop: space[1] },
  panel: { gap: 0 },
  budget: { gap: space[2] },
  quiet: { paddingVertical: space[2] },
  firstRun: { gap: space[3], alignItems: 'flex-start', paddingVertical: space[3] },
});
