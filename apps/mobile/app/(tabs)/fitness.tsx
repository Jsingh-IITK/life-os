import { StyleSheet } from 'react-native';

import { Card, EmptyState, Grid, HeroCard, Screen, SectionHead, Text } from '@/components/ui';
import { space } from '@/design/tokens';

/**
 * Fitness has no schema yet — no plans, sessions, sets or exercises exist in
 * the database. The design board shows a populated dashboard, but filling
 * this screen with a fabricated streak and invented workout history is
 * precisely what the PRD rules out. What it shows instead is what is true.
 */
export default function FitnessScreen() {
  return (
    <Screen eyebrow="FITNESS" title="Train with intention.">
      <HeroCard
        eyebrow="COMING AFTER FINANCE"
        title="Not tracking anything yet."
        body="Training plans, workout templates and set-level logging arrive once the Finance module is complete. Nothing here is recorded, estimated or assumed."
      />

      <Grid columns={2}>
        <Card style={styles.panel}>
          <SectionHead title="What this will hold" />
          <Text variant="secondary" color="textSecondary">
            A weekly plan with gym, boxing and rest days. Workout templates with
            target sets, reps and weights. A diary logging what you actually
            did, set by set.
          </Text>
        </Card>

        <Card style={styles.panel}>
          <SectionHead title="How it will stay honest" />
          <Text variant="secondary" color="textSecondary">
            Sessions snapshot their template when started, so editing a plan
            never rewrites past workouts. Progress comes only from logged sets —
            an unlogged lift shows a dash, never an estimate. Weights are stored
            in whole grams so training volume cannot drift.
          </Text>
        </Card>
      </Grid>

      <EmptyState
        title="Nothing to show"
        description="This module has no data because it has no schema. It will populate from your own logged sessions, not from samples."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space[2] },
});
