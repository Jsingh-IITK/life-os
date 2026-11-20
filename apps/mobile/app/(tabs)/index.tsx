import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Grid,
  HeroCard,
  ListRow,
  Pill,
  ProgressBar,
  SampleNotice,
  Screen,
  SectionHead,
  Text,
} from '@/components/ui';
import { useColors } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { home } from '@/lib/placeholder';

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();

  const today = new Date()
    .toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();

  return (
    <Screen eyebrow={today} title="Your life, in view.">
      <SampleNotice />

      <HeroCard
        eyebrow="YOUR PERSONAL LIFE OS"
        title="A little progress adds up."
        body="Your money and training, in one calm place. Here's the snapshot of how things are moving."
        statLabel="This month's focus"
        statValue="Stay consistent"
        statCaption="Money · Movement · Momentum"
      />

      <Grid columns={4}>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Monthly income</Text>
          <Text variant="metric" tabular style={styles.metric}>{home.monthlyIncome}</Text>
          <Text variant="caption" color="success">↗ Stable this month</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Total expenses</Text>
          <Text variant="metric" tabular style={styles.metric}>{home.totalExpenses}</Text>
          <View style={styles.metricFoot}>
            <Text variant="caption" color="textSecondary">of {home.plannedExpenses} planned</Text>
            <Pill label={`${Math.round(home.expensesPct * 100)}%`} tone="brand" />
          </View>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Workouts this week</Text>
          <Text variant="metric" tabular style={styles.metric}>
            {home.workoutsDone} <Text variant="caption" color="textSecondary">/ {home.workoutsPlanned}</Text>
          </Text>
          <Text variant="caption" color="success">↗ 2 sessions to go</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text variant="caption" color="textSecondary">Savings this month</Text>
          <Text variant="metric" tabular style={styles.metric}>{home.savings}</Text>
          <Text variant="caption" color="success">✓ Monthly target reached</Text>
        </Card>
      </Grid>

      <Grid columns={2}>
        <Card style={styles.panel}>
          <SectionHead
            title="Money overview"
            subtitle="Your monthly spending at a glance"
            trailing={
              <Button label="Open finance →" variant="ghost" size="small" onPress={() => router.push('/finance')} />
            }
          />
          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <Text variant="caption" color="textSecondary">Available after expenses</Text>
              <Text variant="metric" tabular style={styles.metric}>{home.availableAfterExpenses}</Text>
              <Text variant="caption" color="textSecondary">Income minus recorded expenses</Text>
            </View>
            <View style={styles.pairItem}>
              <Text variant="caption" color="textSecondary">Savings rate</Text>
              <Text variant="metric" tabular style={styles.metric}>{home.savingsRate}</Text>
              <Text variant="caption" color="success">On track with your goal</Text>
            </View>
          </View>
          <ProgressBar
            value={home.expensesPct}
            label="Monthly expense budget"
            detail={`${home.totalExpenses} / ${home.plannedExpenses}`}
          />
        </Card>

        <Card style={styles.panel}>
          <SectionHead
            title="This week's training"
            subtitle="A quick look at your routine"
            trailing={
              <Button label="Open fitness →" variant="ghost" size="small" onPress={() => router.push('/fitness')} />
            }
          />
          <View style={styles.week}>
            {home.week.map((d) => {
              const isToday = d.state === 'today';
              return (
                <View
                  key={d.day}
                  style={[
                    styles.day,
                    {
                      backgroundColor: isToday ? colors.brandSubtle : colors.surfaceSecondary,
                      borderColor: isToday ? colors.brandPrimary : colors.borderPrimary,
                    },
                  ]}>
                  <Text variant="caption" color="textSecondary" style={styles.dayLabel}>{d.day}</Text>
                  <Text variant="secondary" tabular style={styles.dayNum}>{d.date}</Text>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: d.state === 'rest' ? colors.borderPrimary : colors.brandPrimary },
                    ]}
                  />
                </View>
              );
            })}
          </View>
          <ListRow icon="🥊" title="Boxing" meta="Today's planned session" trailing={<Pill label="Planned" tone="brand" />} last />
        </Card>
      </Grid>

      <Grid columns={2}>
        <Card style={styles.panel}>
          <SectionHead title="Recent activity" trailing={<Button label="See all" variant="ghost" size="small" onPress={() => router.push('/finance')} />} />
          {home.recent.map((item, i) => (
            <ListRow
              key={item.title}
              icon={item.icon}
              title={item.title}
              meta={item.meta}
              amount={'amount' in item ? item.amount : undefined}
              trailing={'badge' in item ? <Pill label={item.badge} tone="brand" /> : undefined}
              last={i === home.recent.length - 1}
            />
          ))}
        </Card>

        <Card style={styles.panel}>
          <SectionHead title="Your next small win" trailing={<Pill label="Today" />} />
          <Text variant="sectionHeading" style={styles.winTitle}>Show up for the session.</Text>
          <Text variant="caption" color="textSecondary">
            Consistency beats a perfect week. Your planned boxing session is next on the calendar.
          </Text>
          <Button label="View workout plan" onPress={() => router.push('/fitness')} style={styles.winButton} />
        </Card>
      </Grid>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metricCard: { gap: space[1], minHeight: 112 },
  metric: { fontSize: 25, letterSpacing: -1, marginTop: space[1] },
  metricFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  panel: { gap: 0 },
  pair: { flexDirection: 'row', gap: space[4], flexWrap: 'wrap', marginBottom: space[4] },
  pairItem: { flex: 1, minWidth: 140, gap: 2 },
  week: { flexDirection: 'row', gap: space[1], marginBottom: space[2] },
  day: { flex: 1, borderWidth: 1, borderRadius: radius.lg, paddingVertical: space[2], alignItems: 'center', gap: 2 },
  dayLabel: { fontSize: 10 },
  dayNum: { fontSize: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  winTitle: { fontSize: 18, marginTop: space[3], marginBottom: space[1] },
  winButton: { alignSelf: 'flex-start', marginTop: space[3] },
});
