import { StyleSheet, View } from 'react-native';

import {
  BarChart,
  Button,
  Card,
  Grid,
  HeroCard,
  ListRow,
  Pill,
  SampleNotice,
  Screen,
  SectionHead,
  Tag,
  Text,
} from '@/components/ui';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import { fitness } from '@/lib/placeholder';

export default function FitnessScreen() {
  const colors = useColors();

  return (
    <Screen eyebrow="FITNESS" title="Train with intention.">
      <SampleNotice text="Sample data — the Fitness module has no schema yet, so none of this is recorded training history." />

      <HeroCard
        eyebrow="TRAINING OVERVIEW"
        title="Build strength. Keep showing up."
        body="Your training week combines strength work, boxing and recovery. Log each session to make progress measurable."
        statLabel="This week's sessions"
        statValue={`${fitness.sessionsDone} / ${fitness.sessionsPlanned}`}
        statCaption="2 sessions remaining"
      />

      <Grid columns={4}>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Sessions this week</Text>
          <Text variant="metric" tabular style={styles.metric}>{fitness.sessionsDone}</Text>
          <Text variant="caption" color="success">↗ 1 more than last week</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Training time</Text>
          <Text variant="metric" tabular style={styles.metric}>{fitness.trainingTime}</Text>
          <Text variant="caption" color="textSecondary">Gym + boxing</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Current streak</Text>
          <Text variant="metric" tabular style={styles.metric}>{fitness.streak}</Text>
          <Text variant="caption" color="success">Nice momentum</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Strength sessions</Text>
          <Text variant="metric" tabular style={styles.metric}>{fitness.strengthSessions}</Text>
          <Text variant="caption" color="textSecondary">2 boxing sessions too</Text>
        </Card>
      </Grid>

      <Grid columns={2}>
        <Card style={styles.panel}>
          <SectionHead
            title="Training schedule"
            subtitle="Your planned week"
            trailing={<Button label="Edit plan →" variant="ghost" size="small" />}
          />
          {fitness.schedule.map((s, i) => (
            <ListRow
              key={s.title}
              icon={s.icon}
              title={s.title}
              meta={s.meta}
              trailing={
                s.status === 'Today' ? <Tag label="Today" /> : <Pill label={s.status} tone={s.status === 'Done' ? 'brand' : 'neutral'} />
              }
              last={i === fitness.schedule.length - 1}
            />
          ))}
        </Card>

        <Card style={styles.panel}>
          <SectionHead
            title="Today's workout"
            subtitle="Thursday · Pull day"
            trailing={<Pill label="Planned" tone="brand" />}
          />
          {fitness.todayWorkout.map((e, i) => (
            <View
              key={e.name}
              style={[
                styles.exercise,
                {
                  borderBottomColor: colors.borderPrimary,
                  borderBottomWidth: i === fitness.todayWorkout.length - 1 ? 0 : 1,
                },
              ]}>
              <View style={styles.exerciseText}>
                <Text variant="secondary" style={styles.exerciseName}>{e.name}</Text>
                <Text variant="caption" color="textSecondary" style={styles.exerciseDetail}>{e.detail}</Text>
              </View>
              <Tag label={e.tag} />
            </View>
          ))}
          <Button label="Start workout →" fullWidth style={styles.start} />
        </Card>
      </Grid>

      <Grid columns={2}>
        <Card style={styles.panel}>
          <SectionHead title="Strength progress" trailing={<Pill label="Recent highlights" />} />
          {fitness.strength.map((s, i) => (
            <ListRow
              key={s.name}
              title={s.name}
              meta={s.meta}
              amount={s.value}
              last={i === fitness.strength.length - 1}
            />
          ))}
          {/* An unlogged lift shows an em dash above, never an estimate. */}
          <Text variant="caption" color="textMuted" style={styles.note}>
            Progress metrics populate from completed workout logs; no unlogged performance is assumed.
          </Text>
        </Card>

        <Card style={styles.panel}>
          <SectionHead title="Consistency" trailing={<Pill label="Last 4 weeks" />} />
          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <Text variant="metric" tabular style={styles.metric}>{fitness.sessionsCompleted}</Text>
              <Text variant="caption" color="textSecondary">Sessions completed</Text>
            </View>
            <View style={styles.pairItem}>
              <Text variant="metric" tabular style={styles.metric}>{fitness.adherence}</Text>
              <Text variant="caption" color="textSecondary">Plan adherence</Text>
            </View>
          </View>
          <BarChart data={fitness.consistency} height={115} summary="Sessions completed per week over four weeks" />
        </Card>
      </Grid>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metricCard: { gap: space[1], minHeight: 112 },
  metric: { fontSize: 25, letterSpacing: -1, marginTop: space[1] },
  panel: { gap: 0 },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    paddingVertical: space[3],
  },
  exerciseText: { minWidth: 0, flexShrink: 1 },
  exerciseName: { fontSize: 12 },
  exerciseDetail: { fontSize: 10, marginTop: 3 },
  start: { marginTop: space[3] },
  pair: { flexDirection: 'row', gap: space[4], marginBottom: space[4] },
  pairItem: { flex: 1, gap: 2 },
  note: { marginTop: space[4] },
});
