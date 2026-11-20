import { useRouter } from 'expo-router';

import { TransactionForm } from '@/components/finance/TransactionForm';

export default function NewTransactionScreen() {
  const router = useRouter();
  return <TransactionForm onDone={() => router.back()} />;
}
