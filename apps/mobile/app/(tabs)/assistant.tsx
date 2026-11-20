import { EmptyState, Screen } from '@/components/ui';

export default function AssistantScreen() {
  return (
    <Screen title="Assistant" subtitle="Conversational entry, in English and Hinglish.">
      <EmptyState
        title="Not connected yet"
        description="The assistant proposes structured drafts that you confirm; it performs no arithmetic and never sees another module's data. No AI provider is wired up yet — that decision comes with the conversational entry milestone."
      />
    </Screen>
  );
}
