import { Money, Postings } from '@life-os/finance-core';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ErrorState,
  Input,
  LoadingState,
  Select,
  Text,
  type Option,
} from '@/components/ui';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import { useHasChartOfAccounts, type LedgerAccount } from '@/lib/queries/accounts';
import {
  usePostTransaction,
  useUpdateTransaction,
  type TransactionDetail,
} from '@/lib/queries/transactions';

export interface TransactionFormProps {
  /** Present when amending an existing entry. */
  existingId?: string;
  initial?: TransactionDetail;
  onDone: () => void;
}

type EntryType = 'expense' | 'income' | 'transfer';

const TYPES: readonly Option<EntryType>[] = [
  { value: 'expense', label: 'Expense', hint: 'Money out' },
  { value: 'income', label: 'Income', hint: 'Money in' },
  { value: 'transfer', label: 'Transfer', hint: 'Between accounts' },
];

const PAYMENT_METHODS: readonly Option<string>[] = [
  { value: '', label: 'Not stated' },
  { value: 'upi', label: 'UPI' },
  { value: 'debit_card', label: 'Debit card' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

/**
 * Today's date in the device's own timezone.
 *
 * NOT toISOString(), which converts to UTC: in IST that returns yesterday's
 * date for the first five and a half hours of every day, so an expense entered
 * at 2am would be filed against the wrong day — and, at a month boundary, the
 * wrong month's spending. The whole schema stores txn_date as a DATE for this
 * reason; defaulting it from UTC would reintroduce the bug at the entry point.
 */
function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function TransactionForm({ existingId, initial, onDone }: TransactionFormProps) {
  const colors = useColors();
  const accounts = useHasChartOfAccounts();
  const post = usePostTransaction();
  const update = useUpdateTransaction();
  const saving = post.isPending || update.isPending;

  // An existing entry is decomposed back into the form's terms: the positive
  // leg is the category or destination, the negative leg is what it came from.
  const seedPositive = initial?.legs.find((l) => l.amount > 0);
  const seedNegative = initial?.legs.find((l) => l.amount < 0);
  const seedType: EntryType =
    initial?.type === 'income' ? 'income' : initial?.type === 'transfer' ? 'transfer' : 'expense';

  const [type, setType] = useState<EntryType>(seedType);
  const [amountText, setAmountText] = useState(
    seedPositive ? Money.toRupees(Money.abs(seedPositive.amount)) : '',
  );
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [merchant, setMerchant] = useState(initial?.merchant ?? '');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(
    seedType === 'transfer' ? null : (seedPositive?.accountId ?? null),
  );
  const [accountId, setAccountId] = useState<string | null>(
    seedType === 'transfer' ? (seedNegative?.accountId ?? null) : (seedNegative?.accountId ?? null),
  );
  const [toAccountId, setToAccountId] = useState<string | null>(
    seedType === 'transfer' ? (seedPositive?.accountId ?? null) : null,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const all = accounts.data ?? [];
  const byClass = (cls: LedgerAccount['accountClass']) => all.filter((a) => a.accountClass === cls);

  const expenses = byClass('EXPENSE');
  const incomes = byClass('INCOME');
  const assets = byClass('ASSET');
  const liabilities = byClass('LIABILITY');
  const payFrom = [...assets, ...liabilities];

  // Parsed rather than coerced: the parser accepts "1.25 lakh" and refuses
  // anything it cannot read exactly, instead of guessing.
  const parsed = useMemo(() => Money.parseAmount(amountText), [amountText]);
  const amountError = amountText.length > 0 && !parsed.ok ? parsed.reason : null;

  const categoryOptions: Option<string>[] = (type === 'income' ? incomes : expenses).map((a) => ({
    value: a.id,
    label: a.name,
  }));
  const accountOptions: Option<string>[] = payFrom.map((a) => ({ value: a.id, label: a.name }));

  const needsCategory = type !== 'transfer';
  const ready =
    parsed.ok &&
    date.length === 10 &&
    (needsCategory ? categoryId !== null && accountId !== null : accountId !== null && toAccountId !== null);

  async function submit() {
    if (!ready || !parsed.ok) return;
    setSubmitError(null);

    try {
      const amount = parsed.amount;
      let input: Postings.TransactionInput;

      if (type === 'expense') {
        // A card purchase is expenditure at the time of purchase and raises
        // the liability; paying the card later settles it without
        // double-counting.
        const isCard = liabilities.some((l) => l.id === accountId);
        input = isCard
          ? {
              type: 'cc_purchase',
              amount,
              categoryAccountId: categoryId!,
              cardAccountId: accountId!,
            }
          : {
              type: 'expense',
              amount,
              categoryAccountId: categoryId!,
              paidFromAccountId: accountId!,
            };
      } else if (type === 'income') {
        input = {
          type: 'income',
          amount,
          incomeAccountId: categoryId!,
          depositedToAccountId: accountId!,
        };
      } else {
        input = { type: 'transfer', amount, fromAccountId: accountId!, toAccountId: toAccountId! };
      }

      const entry = {
        input,
        date,
        merchant: merchant.trim() || undefined,
        paymentMethod: paymentMethod || null,
      };

      if (existingId) {
        await update.mutateAsync({ id: existingId, entry });
      } else {
        await post.mutateAsync(entry);
      }

      onDone();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }

  if (accounts.isPending) return <LoadingState label="Loading accounts…" />;
  if (accounts.isError) {
    return <ErrorState message={accounts.error.message} onRetry={() => void accounts.refetch()} />;
  }
  if (all.length === 0) {
    return (
      <View style={[styles.page, { backgroundColor: colors.backgroundPrimary }]}>
        <Card>
          <Text variant="cardHeading">No accounts yet</Text>
          <Text variant="secondary" color="textSecondary">
            Set up your chart of accounts on the Finance tab first.
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.backgroundPrimary }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        <Select label="What kind of entry?" options={TYPES} value={type} onChange={setType} />

        <Input
          label="Amount"
          placeholder="300, 1,250.75 or 1.25 lakh"
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
          numeric
          error={amountError}
          hint={parsed.ok && amountText ? Money.formatINR(parsed.amount, { paise: 'always' }) : undefined}
        />

        <Input
          label="Date"
          placeholder="YYYY-MM-DD"
          value={date}
          onChangeText={setDate}
          autoCapitalize="none"
          numeric
        />

        {needsCategory ? (
          <Select
            label={type === 'income' ? 'Income source' : 'Category'}
            options={categoryOptions}
            value={categoryId ?? ''}
            onChange={setCategoryId}
          />
        ) : null}

        <Select
          label={type === 'income' ? 'Deposited to' : type === 'transfer' ? 'From' : 'Paid from'}
          options={accountOptions}
          value={accountId ?? ''}
          onChange={setAccountId}
        />

        {type === 'transfer' ? (
          <Select
            label="To"
            options={accountOptions.filter((o) => o.value !== accountId)}
            value={toAccountId ?? ''}
            onChange={setToAccountId}
          />
        ) : null}

        <Input
          label="Merchant or note"
          placeholder="Optional"
          value={merchant}
          onChangeText={setMerchant}
        />

        {type !== 'transfer' ? (
          <Select
            label="Payment method"
            options={PAYMENT_METHODS}
            value={paymentMethod}
            onChange={setPaymentMethod}
          />
        ) : null}

        {type === 'transfer' ? (
          <Text variant="caption" color="textMuted">
            A transfer moves money between your own accounts. It is not spending
            and will not appear in any category total.
          </Text>
        ) : null}

        {submitError ? (
          <Text variant="secondary" color="danger">
            {submitError}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={saving ? 'Saving…' : existingId ? 'Save changes' : 'Save transaction'}
            onPress={() => void submit()}
            disabled={!ready}
            loading={saving}
            size="large"
          />
          <Button label="Cancel" variant="ghost" onPress={onDone} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space[5], alignItems: 'center' },
  column: { width: '100%', maxWidth: 520, gap: space[5] },
  actions: { flexDirection: 'row', gap: space[3], alignItems: 'center', marginTop: space[2] },
});
