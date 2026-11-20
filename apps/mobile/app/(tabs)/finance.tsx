import { ModuleScreen, styles } from '@/components/ModuleScreen';
import { Text } from '@/components/Themed';

export default function FinanceScreen() {
  return (
    <ModuleScreen title="Finance" phase="Phases 2–4">
      <Text style={styles.caption}>
        Accounts, transactions, budgets and wealth. Built on a double-entry
        ledger so transfers, card repayments and investment purchases cannot be
        counted as spending.
      </Text>
    </ModuleScreen>
  );
}
