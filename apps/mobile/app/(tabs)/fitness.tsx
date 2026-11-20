import { EmptyState, Screen } from '@/components/ui';

export default function FitnessScreen() {
  return (
    <Screen title="Fitness" subtitle="Training plan, workout diary and progress.">
      <EmptyState
        title="Not built yet"
        description="Training plans, workout templates and set-level logging arrive after the Finance module is complete. Sessions will snapshot their template when started, so editing a plan never rewrites past workouts."
      />
    </Screen>
  );
}
