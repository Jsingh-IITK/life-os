import { EmptyState, Screen } from '@/components/ui';

export default function FinanceScreen() {
  return (
    <Screen
      title="Finance"
      subtitle="Accounts, transactions, budgets and wealth.">
      <EmptyState
        title="No accounts yet"
        description="Add a bank account or card to start recording transactions. Every figure here will be traceable to the entries behind it — balances are derived from the ledger, never stored."
      />
    </Screen>
  );
}
