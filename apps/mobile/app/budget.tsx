import { Money } from '@life-os/finance-core';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  ErrorState,
  Input,
  LoadingState,
  ProgressBar,
  Screen,
  SectionHead,
  Text,
} from '@/components/ui';
import { space } from '@/design/tokens';
import { useHasChartOfAccounts } from '@/lib/queries/accounts';
import { monthKey, monthLabel, useBudget, useSaveBudget } from '@/lib/queries/budgets';

export default function BudgetScreen() {
  const router = useRouter();
  const month = monthKey();
  const accounts = useHasChartOfAccounts();
  const budget = useBudget(month);
  const save = useSaveBudget(month);
  const [editing, setEditing] = useState(false);

  const categories = useMemo(
    () => (accounts.data ?? []).filter((a) => a.accountClass === 'EXPENSE'),
    [accounts.data],
  );

  if (accounts.isPending || budget.isPending) {
    return (
      <Screen eyebrow="FINANCE" title="Budget">
        <LoadingState label="Loading budget…" />
      </Screen>
    );
  }

  if (budget.isError) {
    return (
      <Screen eyebrow="FINANCE" title="Budget">
        <ErrorState message={budget.error.message} onRetry={() => void budget.refetch()} />
      </Screen>
    );
  }

  const { summary } = budget.data!;
  const hasBudget = summary.allocations.length > 0;

  if (editing || !hasBudget) {
    return (
      <BudgetEditor
        month={month}
        categories={categories}
        existing={summary.allocations}
        saving={save.isPending}
        error={save.isError ? save.error.message : null}
        onSave={(drafts) => save.mutate(drafts, { onSuccess: () => setEditing(false) })}
        onCancel={hasBudget ? () => setEditing(false) : () => router.back()}
      />
    );
  }

  return (
    <Screen
      eyebrow={monthLabel(month).toUpperCase()}
      title="Budget"
      subtitle={`${Money.formatINR(summary.totalActual)} of ${Money.formatINR(summary.totalPlanned)} planned`}>
      <Card style={styles.overview}>
        <SectionHead
          title="This month"
          trailing={<Button label="Edit" variant="ghost" size="small" onPress={() => setEditing(true)} />}
        />

        <ProgressBar
          value={summary.utilisation}
          label="Overall"
          detail={`${Math.round(summary.utilisation * 100)}%`}
          tone={summary.utilisation > 1 ? 'danger' : summary.utilisation >= 0.85 ? 'warning' : 'brand'}
        />

        <View style={styles.totals}>
          <View style={styles.total}>
            <Text variant="caption" color="textSecondary">Left to spend</Text>
            <Text variant="sectionHeading" tabular>{Money.formatINR(summary.totalRemaining)}</Text>
          </View>
          {/* Shown separately rather than netted: one category's underspend
              must not hide another's overspend. */}
          {!Money.isZero(summary.totalOverspend) ? (
            <View style={styles.total}>
              <Text variant="caption" color="textSecondary">Over in some categories</Text>
              <Text variant="sectionHeading" color="danger" tabular>
                {Money.formatINR(summary.totalOverspend)}
              </Text>
            </View>
          ) : null}
        </View>

        {summary.overCategories.length > 0 ? (
          <Text variant="caption" color="danger">
            Over in {summary.overCategories.map((c) => c.categoryName).join(', ')}.
          </Text>
        ) : null}
      </Card>

      <Card style={styles.list}>
        <SectionHead title="By category" subtitle="Planned against actual" />
        {summary.allocations.map((a) => (
          <View key={a.categoryId} style={styles.row}>
            <View style={styles.rowHead}>
              <Text variant="secondary">{a.categoryName}</Text>
              {/* Health is stated in words as well as colour, so the warning
                  does not depend on colour perception. */}
              {a.health === 'over' ? (
                <Badge label={`${Money.formatINR(a.overspend)} over`} tone="danger" />
              ) : a.health === 'close' ? (
                <Badge label="Nearly spent" tone="warning" />
              ) : null}
            </View>
            <ProgressBar
              value={a.utilisation}
              detail={`${Money.formatINR(a.actual)} / ${Money.formatINR(a.available)}`}
              tone={a.health === 'over' ? 'danger' : a.health === 'close' ? 'warning' : 'brand'}
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function BudgetEditor({
  month,
  categories,
  existing,
  saving,
  error,
  onSave,
  onCancel,
}: {
  month: string;
  categories: { id: string; name: string }[];
  existing: readonly { categoryId: string; planned: Money.Paise }[];
  saving: boolean;
  error: string | null;
  onSave: (drafts: { categoryId: string; planned: Money.Paise }[]) => void;
  onCancel: () => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const a of existing) seed[a.categoryId] = Money.toRupees(a.planned);
    return seed;
  });

  const parsed = categories.map((c) => {
    const text = amounts[c.id] ?? '';
    const result = text.trim() ? Money.parseAmount(text) : ({ ok: true, amount: 0 } as const);
    return { category: c, text, result };
  });

  const firstError = parsed.find((p) => !p.result.ok);
  const total = Money.sum(parsed.filter((p) => p.result.ok).map((p) => (p.result as { amount: Money.Paise }).amount));

  return (
    <Screen
      eyebrow={monthLabel(month).toUpperCase()}
      title="Set your budget"
      subtitle="Leave a category blank to leave it unbudgeted.">
      <Card style={styles.list}>
        {parsed.map(({ category, text, result }) => (
          <View key={category.id} style={styles.editorRow}>
            <Input
              label={category.name}
              placeholder="0"
              value={text}
              onChangeText={(v) => setAmounts((prev) => ({ ...prev, [category.id]: v }))}
              keyboardType="decimal-pad"
              numeric
              error={!result.ok ? result.reason : null}
            />
          </View>
        ))}
      </Card>

      <Card style={styles.overview}>
        <Text variant="caption" color="textSecondary">Total planned</Text>
        <Text variant="metric" tabular>{Money.formatINR(total)}</Text>
        {error ? <Text variant="secondary" color="danger">{error}</Text> : null}
        <View style={styles.actions}>
          <Button
            label={saving ? 'Saving…' : 'Save budget'}
            loading={saving}
            disabled={!!firstError}
            onPress={() =>
              onSave(
                parsed
                  .filter((p) => p.result.ok)
                  .map((p) => ({
                    categoryId: p.category.id,
                    planned: (p.result as { amount: Money.Paise }).amount,
                  })),
              )
            }
          />
          <Button label="Cancel" variant="ghost" onPress={onCancel} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  overview: { gap: space[3] },
  totals: { flexDirection: 'row', gap: space[6], flexWrap: 'wrap' },
  total: { gap: 2 },
  list: { gap: space[4] },
  row: { gap: space[2] },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  editorRow: { gap: space[1] },
  actions: { flexDirection: 'row', gap: space[3], alignItems: 'center' },
});
