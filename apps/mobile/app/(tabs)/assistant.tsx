import type { FinanceAssistant } from '@life-os/ai-core';
import { Money } from '@life-os/finance-core';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Input, Screen, SectionHead, Select, Text } from '@/components/ui';
import { space } from '@/design/tokens';
import { useHasChartOfAccounts } from '@/lib/queries/accounts';
import {
  type AssistantReply,
  useAssistantPropose,
  useConfirmDraft,
  useDismissDraft,
} from '@/lib/queries/assistant';

/**
 * Functional first version: type a spending message, check the draft, confirm.
 * Visual design follows later (docs/design/DIRECTION_B.md); this screen is
 * about the flow being correct.
 */

const PAYMENT_LABELS: Record<FinanceAssistant.PaymentMethod, string> = {
  upi: 'UPI',
  credit_card: 'Credit card',
  debit_card: 'Debit card',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
};

const WARNING_TEXT: Record<FinanceAssistant.DraftWarning, string> = {
  date_assumed_today: 'No date was given, so this uses today. Change it in History after saving if needed.',
  future_date: 'This date is in the future. It will show as scheduled.',
  category_not_recognised: 'The suggested category is not one of yours. Pick one below.',
  payment_method_not_recognised: 'The payment method was not recognised, so it was left blank.',
};

export default function AssistantScreen() {
  const accounts = useHasChartOfAccounts();
  const all = accounts.data ?? [];
  const categories = useMemo(
    () => all.filter((a) => a.accountClass === 'EXPENSE').map((a) => ({ id: a.id, name: a.name })),
    [all],
  );

  const propose = useAssistantPropose(categories);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<AssistantReply | null>(null);

  const send = () => {
    if (!text.trim()) return;
    propose.mutate(text, {
      onSuccess: (r) => {
        setReply(r);
        if (r.kind === 'draft') setText('');
      },
    });
  };

  const noAccounts = accounts.isSuccess && categories.length === 0;

  return (
    <Screen title="Assistant" subtitle="Tell it what you spent, in English or Hinglish. Nothing is saved until you confirm.">
      <Card style={styles.panel}>
        <Input
          label="Message"
          value={text}
          onChangeText={setText}
          placeholder='e.g. "spent 300 on lunch via UPI" or "chai pe 40 gaye"'
          maxLength={1000}
          onSubmitEditing={send}
        />
        <Button
          label="Read it"
          loading={propose.isPending}
          disabled={!text.trim() || noAccounts}
          onPress={send}
          style={styles.send}
        />
        {noAccounts ? (
          <Text variant="caption" color="textSecondary">
            Set up your accounts in Finance first.
          </Text>
        ) : null}
        {propose.isError ? (
          <Text variant="caption" color="danger">
            {propose.error.message}
          </Text>
        ) : null}
      </Card>

      {reply === null ? null : reply.kind === 'draft' ? (
        <DraftCard
          key={reply.logId}
          reply={reply}
          categories={categories}
          payFrom={all.filter((a) => a.accountClass === 'ASSET' || a.accountClass === 'LIABILITY')}
          onDone={() => setReply(null)}
        />
      ) : (
        <Card style={styles.panel}>
          <Text variant="secondary">{reply.detail}</Text>
        </Card>
      )}
    </Screen>
  );
}

function DraftCard({
  reply,
  categories,
  payFrom,
  onDone,
}: {
  reply: Extract<AssistantReply, { kind: 'draft' }>;
  categories: readonly { id: string; name: string }[];
  payFrom: readonly { id: string; name: string; accountClass: string }[];
  onDone: () => void;
}) {
  const { draft } = reply;
  const confirm = useConfirmDraft();
  const dismiss = useDismissDraft();

  const cards = payFrom.filter((a) => a.accountClass === 'LIABILITY');
  const assets = payFrom.filter((a) => a.accountClass === 'ASSET');
  // Pre-select only when there is exactly one sensible account. Otherwise ask.
  const suggested =
    draft.paymentMethod === 'credit_card'
      ? (cards.length === 1 ? cards[0]!.id : '')
      : assets.length === 1
        ? assets[0]!.id
        : '';

  const [categoryId, setCategoryId] = useState(draft.categoryId ?? '');
  const [accountId, setAccountId] = useState(suggested);
  const [saved, setSaved] = useState(false);

  const isCard = cards.some((c) => c.id === accountId);
  const ready = categoryId !== '' && accountId !== '' && !saved;

  if (saved) {
    return (
      <Card style={styles.panel}>
        <Text variant="secondary">
          Saved {Money.formatINR(draft.amount)} on {draft.date}.
        </Text>
        <Button label="Done" variant="ghost" size="small" onPress={onDone} style={styles.send} />
      </Card>
    );
  }

  return (
    <Card style={styles.panel}>
      <SectionHead
        title="Check this expense"
        subtitle={reply.engine === 'gemini' ? `Read by ${reply.model ?? 'Gemini'}` : 'Read by the built-in rules'}
      />

      <Text variant="metric" tabular>
        {Money.formatINR(draft.amount)}
      </Text>
      <Text variant="caption" color="textSecondary">
        From “{draft.amountText}” · {draft.date}
        {draft.merchant ? ` · ${draft.merchant}` : ''}
        {draft.paymentMethod ? ` · ${PAYMENT_LABELS[draft.paymentMethod]}` : ''}
        {draft.description ? ` · ${draft.description}` : ''}
      </Text>

      {draft.warnings.map((w) => (
        <Text key={w} variant="caption" color="textSecondary">
          {WARNING_TEXT[w]}
        </Text>
      ))}

      <Select
        label="Category"
        value={categoryId}
        onChange={setCategoryId}
        options={[{ value: '', label: 'Choose…' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
      />
      <Select
        label={isCard ? 'Charged to' : 'Paid from'}
        value={accountId}
        onChange={setAccountId}
        options={[{ value: '', label: 'Choose…' }, ...payFrom.map((a) => ({ value: a.id, label: a.name }))]}
      />

      {confirm.isError ? (
        <Text variant="caption" color="danger">
          {confirm.error.message}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Save expense"
          disabled={!ready}
          loading={confirm.isPending}
          onPress={() =>
            confirm.mutate(
              { logId: reply.logId, draft, categoryId, accountId, isCard },
              { onSuccess: () => setSaved(true) },
            )
          }
        />
        <Button
          label="Discard"
          variant="ghost"
          loading={dismiss.isPending}
          onPress={() => dismiss.mutate(reply.logId, { onSettled: onDone })}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space[2] },
  send: { alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', gap: space[2], marginTop: space[2] },
});
