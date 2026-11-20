import { StyleSheet, View } from 'react-native';

import {
  BarChart,
  Button,
  Card,
  Grid,
  ListRow,
  Pill,
  ProgressBar,
  Ring,
  SampleNotice,
  Screen,
  SectionHead,
  Text,
} from '@/components/ui';
import { space } from '@/design/tokens';
import { finance } from '@/lib/placeholder';

export default function FinanceScreen() {
  return (
    <Screen eyebrow="FINANCE" title="Make your money make sense.">
      <SampleNotice />

      <Grid columns={4}>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Monthly income</Text>
          <Text variant="metric" tabular style={styles.metric}>{finance.monthlyIncome}</Text>
          <Text variant="caption" color="textSecondary">Expected take-home</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Spent so far</Text>
          <Text variant="metric" tabular style={styles.metric}>{finance.spent}</Text>
          <Text variant="caption" color="success">{Math.round(finance.spentPct * 100)}% of planned budget</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Savings</Text>
          <Text variant="metric" tabular style={styles.metric}>{finance.savings}</Text>
          <Text variant="caption" color="success">✓ Target reached</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Net worth</Text>
          <Text variant="metric" tabular style={styles.metric}>{finance.netWorth}</Text>
          <Text variant="caption" color="textSecondary">Across tracked assets & liabilities</Text>
        </Card>
      </Grid>

      <Grid columns={2}>
        <Card style={styles.panel}>
          <SectionHead
            title="Spending overview"
            subtitle="Monthly expenses by category"
            trailing={<Pill label="November 2026" />}
          />
          <View style={styles.ringRow}>
            <Ring
              value={finance.spentPct}
              caption={`${Math.round(finance.spentPct * 100)}%`}
              accessibilityLabel={`${Math.round(finance.spentPct * 100)} percent of the monthly budget spent`}
            />
            <View style={styles.ringText}>
              <Text variant="caption" color="textSecondary">{finance.spent} spent</Text>
              <Text variant="sectionHeading" tabular style={styles.ringValue}>{finance.budgetLeft} left</Text>
              <Text variant="caption" color="textSecondary">of {finance.plannedBudget} planned budget</Text>
            </View>
          </View>

          <View style={styles.bars}>
            {finance.categories.map((c) => (
              <ProgressBar key={c.name} value={c.pct} label={c.name} detail={c.amount} />
            ))}
          </View>
        </Card>

        <Card style={styles.panel}>
          <SectionHead
            title="Cash flow"
            subtitle="Income vs expenses · last 6 months"
            trailing={<Pill label="₹ INR" />}
          />
          <BarChart
            data={finance.cashFlow}
            summary={`Monthly spending over six months, highest in ${finance.cashFlow[finance.cashFlow.length - 1]?.label}`}
          />
          <View style={styles.summaryRows}>
            <ListRow title="Average monthly spend" amount={finance.averageSpend} />
            <ListRow title="Savings rate" amount={finance.savingsRate} amountTone="success" last />
          </View>
        </Card>
      </Grid>

      <Grid columns={2}>
        <Card style={styles.panel}>
          <SectionHead title="Recent transactions" trailing={<Button label="View all →" variant="ghost" size="small" />} />
          {finance.transactions.map((t, i) => (
            <ListRow
              key={t.title}
              icon={t.icon}
              title={t.title}
              meta={t.meta}
              amount={t.amount}
              amountTone={'positive' in t && t.positive ? 'success' : 'textPrimary'}
              last={i === finance.transactions.length - 1}
            />
          ))}
        </Card>

        <Card style={styles.panel}>
          <SectionHead title="Financial goals" trailing={<Button label="Manage →" variant="ghost" size="small" />} />
          <View style={styles.bars}>
            {finance.goals.map((g) => (
              <ProgressBar key={g.name} value={g.pct} label={g.name} detail={g.detail} />
            ))}
          </View>
          {/* The accounting rule, stated where it is relevant. */}
          <Text variant="caption" color="textMuted" style={styles.note}>
            Transfers and investments are tracked separately from lifestyle spending.
          </Text>
        </Card>
      </Grid>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metricCard: { gap: space[1], minHeight: 112 },
  metric: { fontSize: 25, letterSpacing: -1, marginTop: space[1] },
  panel: { gap: 0 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: space[5], marginBottom: space[4] },
  ringText: { gap: 2, flexShrink: 1, minWidth: 0 },
  ringValue: { fontSize: 20 },
  bars: { gap: space[4] },
  summaryRows: { marginTop: space[4] },
  note: { marginTop: space[4] },
});
