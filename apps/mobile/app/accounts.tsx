import { Money } from '@life-os/finance-core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  SectionHead,
  Select,
  Text,
  type Option,
} from '@/components/ui';
import { space } from '@/design/tokens';
import {
  useAccountBalances,
  useArchiveAccount,
  useCreateAccount,
  useRenameAccount,
  useSetOpeningBalance,
  type AccountBalance,
  type AccountClass,
} from '@/lib/queries/accounts';

const CLASS_LABEL: Record<AccountClass, string> = {
  ASSET: 'Accounts',
  LIABILITY: 'Cards & loans',
  INCOME: 'Income sources',
  EXPENSE: 'Spending categories',
  EQUITY: 'Opening balances',
};

const NEW_KINDS: readonly Option<string>[] = [
  { value: 'ASSET', label: 'Bank or cash', hint: 'Money you hold' },
  { value: 'LIABILITY', label: 'Card or loan', hint: 'Money you owe' },
  { value: 'EXPENSE', label: 'Spending category', hint: 'Where money goes' },
  { value: 'INCOME', label: 'Income source', hint: 'Where money comes from' },
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AccountsScreen() {
  const balances = useAccountBalances();
  const create = useCreateAccount();
  const rename = useRenameAccount();
  const archive = useArchiveAccount();
  const openingBalance = useSetOpeningBalance();

  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<string>('ASSET');

  if (balances.isPending) {
    return (
      <Screen eyebrow="SETTINGS" title="Accounts & categories">
        <LoadingState label="Loading accounts…" />
      </Screen>
    );
  }
  if (balances.isError) {
    return (
      <Screen eyebrow="SETTINGS" title="Accounts & categories">
        <ErrorState message={balances.error.message} onRetry={() => void balances.refetch()} />
      </Screen>
    );
  }

  const rows = balances.data ?? [];
  const groups: AccountClass[] = ['ASSET', 'LIABILITY', 'EXPENSE', 'INCOME', 'EQUITY'];

  return (
    <Screen
      eyebrow="SETTINGS"
      title="Accounts & categories"
      subtitle="Rename, add or archive. Everything here is yours to change.">
      <Card style={styles.panel}>
        <SectionHead title="Add something new" />
        <Select label="What kind?" options={NEW_KINDS} value={newKind} onChange={setNewKind} />
        <Input
          label="Name"
          placeholder="e.g. HDFC Savings, Physio, Freelance"
          value={newName}
          onChangeText={setNewName}
        />
        {create.isError ? (
          <Text variant="secondary" color="danger">
            {create.error.message}
          </Text>
        ) : null}
        <Button
          label={create.isPending ? 'Adding…' : 'Add'}
          disabled={newName.trim().length === 0}
          loading={create.isPending}
          onPress={() =>
            create.mutate(
              { name: newName, accountClass: newKind as AccountClass },
              { onSuccess: () => setNewName('') },
            )
          }
        />
      </Card>

      {groups.map((cls) => {
        const inGroup = rows.filter((r) => r.accountClass === cls);
        if (inGroup.length === 0) return null;
        return (
          <Card key={cls} style={styles.panel}>
            <SectionHead title={CLASS_LABEL[cls]} />
            {inGroup.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                onRename={(name) => rename.mutate({ id: account.id, name })}
                onArchive={() => archive.mutate({ id: account.id, archived: true })}
                onOpeningBalance={(amount) =>
                  openingBalance.mutate({ accountId: account.id, amount, date: todayISO() })
                }
                balanceError={openingBalance.isError ? openingBalance.error.message : null}
              />
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}

function AccountRow({
  account,
  onRename,
  onArchive,
  onOpeningBalance,
  balanceError,
}: {
  account: AccountBalance;
  onRename: (name: string) => void;
  onArchive: () => void;
  onOpeningBalance: (amount: Money.Paise) => void;
  balanceError: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [balanceText, setBalanceText] = useState('');

  const canHoldBalance = account.accountClass === 'ASSET' || account.accountClass === 'LIABILITY';
  const parsed = balanceText.trim() ? Money.parseAmount(balanceText) : null;

  if (!editing) {
    return (
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text variant="secondary">{account.name}</Text>
          {canHoldBalance ? (
            <Text variant="caption" color="textMuted" tabular>
              {Money.formatINR(account.balance)}
            </Text>
          ) : null}
        </View>
        <Button label="Edit" variant="ghost" size="small" onPress={() => setEditing(true)} />
      </View>
    );
  }

  return (
    <View style={styles.editor}>
      <Input label="Name" value={name} onChangeText={setName} />

      {canHoldBalance ? (
        <Input
          label="Set opening balance"
          placeholder="Leave blank to skip"
          value={balanceText}
          onChangeText={setBalanceText}
          keyboardType="decimal-pad"
          numeric
          error={parsed && !parsed.ok ? parsed.reason : null}
          hint={
            account.accountClass === 'LIABILITY'
              ? 'What you owe. Posted against opening-balance equity.'
              : 'What this held before you started tracking.'
          }
        />
      ) : null}

      {balanceError ? (
        <Text variant="secondary" color="danger">
          {balanceError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Save"
          size="small"
          onPress={() => {
            if (name.trim() && name !== account.name) onRename(name);
            if (parsed?.ok && !Money.isZero(parsed.amount)) {
              // A liability's opening balance is money owed, so it is posted
              // as a credit rather than a debit.
              const signed =
                account.accountClass === 'LIABILITY'
                  ? Money.negate(parsed.amount)
                  : parsed.amount;
              onOpeningBalance(signed);
            }
            setBalanceText('');
            setEditing(false);
          }}
        />
        <Button label="Cancel" variant="ghost" size="small" onPress={() => setEditing(false)} />
        <Button label="Archive" variant="destructive" size="small" onPress={onArchive} />
      </View>
      {/* Archiving, not deleting: an account with history cannot be removed
          without silently changing past balances. */}
      <Text variant="caption" color="textMuted">
        Archiving hides it from pickers. History is kept.
      </Text>
      <Badge label={account.accountClass} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], paddingVertical: space[2] },
  rowText: { gap: 2, flexShrink: 1, minWidth: 0 },
  editor: { gap: space[3], paddingVertical: space[3] },
  actions: { flexDirection: 'row', gap: space[2], alignItems: 'center', flexWrap: 'wrap' },
});
