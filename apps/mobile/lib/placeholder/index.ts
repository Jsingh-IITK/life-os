/**
 * PLACEHOLDER DATA — not real, not derived from the database.
 *
 * Every dashboard figure currently comes from here. It exists so the layout
 * can be designed and reviewed before the data layer lands; it is deliberately
 * confined to this one file so replacing it is a single change rather than a
 * hunt through screens.
 *
 * Rules while this exists:
 *  - Screens that render it MUST show the sample-data notice, so no figure is
 *    ever mistaken for the user's own money or training history.
 *  - Nothing here may be written to the database.
 *  - Delete this file as each screen is connected; do not let it become a
 *    permanent fallback.
 *
 * Figures mirror the HTML mockup, which is itself illustrative.
 */

export const IS_PLACEHOLDER = true;

export const SAMPLE_NOTICE =
  'Sample data — add accounts and transactions to see your own figures here.';

export const home = {
  monthlyIncome: '₹1,25,000',
  totalExpenses: '₹48,250',
  plannedExpenses: '₹70,500',
  expensesPct: 0.68,
  workoutsDone: 4,
  workoutsPlanned: 6,
  savings: '₹35,000',
  availableAfterExpenses: '₹76,750',
  savingsRate: '28%',
  week: [
    { day: 'MON', date: '17', state: 'done' },
    { day: 'TUE', date: '18', state: 'done' },
    { day: 'WED', date: '19', state: 'done' },
    { day: 'THU', date: '20', state: 'today' },
    { day: 'FRI', date: '21', state: 'planned' },
    { day: 'SAT', date: '22', state: 'planned' },
    { day: 'SUN', date: '23', state: 'rest' },
  ],
  recent: [
    { icon: '☕', title: 'Coffee & breakfast', meta: 'Today · Food & drink', amount: '−₹280' },
    { icon: '🚕', title: 'Commute', meta: 'Yesterday · Transport', amount: '−₹190' },
    { icon: '🏋️', title: 'Upper body session', meta: 'Yesterday · 58 min', badge: 'Completed' },
  ],
} as const;

export const finance = {
  monthlyIncome: '₹1,25,000',
  spent: '₹48,250',
  spentPct: 0.68,
  savings: '₹35,000',
  netWorth: '₹4,82,600',
  budgetLeft: '₹22,250',
  plannedBudget: '₹70,500',
  categories: [
    { name: 'Home & bills', amount: '₹18,000', pct: 0.8 },
    { name: 'Food & groceries', amount: '₹12,500', pct: 0.62 },
    { name: 'Transport', amount: '₹5,750', pct: 0.48 },
    { name: 'Shopping & lifestyle', amount: '₹4,000', pct: 0.4 },
  ],
  cashFlow: [
    { label: 'JUN', value: 42 },
    { label: 'JUL', value: 55 },
    { label: 'AUG', value: 49 },
    { label: 'SEP', value: 67 },
    { label: 'OCT', value: 59 },
    { label: 'NOV', value: 74, current: true },
  ],
  averageSpend: '₹46,800',
  savingsRate: '28%',
  transactions: [
    { icon: '🏠', title: 'Rent', meta: 'Nov 18 · Housing', amount: '−₹15,000' },
    { icon: '🥗', title: 'Groceries', meta: 'Nov 17 · Food', amount: '−₹1,240' },
    { icon: '⛽', title: 'Petrol', meta: 'Nov 16 · Transport', amount: '−₹850' },
    { icon: '💼', title: 'Salary', meta: 'Nov 15 · Income', amount: '+₹1,25,000', positive: true },
  ],
  goals: [
    { name: 'Emergency fund', detail: '₹1.5L / ₹3L', pct: 0.5 },
    { name: 'Monthly savings', detail: '₹35K / ₹35K', pct: 1 },
    { name: 'Travel fund', detail: '₹12K / ₹50K', pct: 0.24 },
  ],
} as const;

export const fitness = {
  sessionsDone: 4,
  sessionsPlanned: 6,
  trainingTime: '4h 35m',
  streak: '3 days',
  strengthSessions: 2,
  schedule: [
    { icon: '🥊', title: 'Monday · Boxing', meta: 'Technique + conditioning', status: 'Done' },
    { icon: '🏋️', title: 'Tuesday · Push', meta: 'Chest, shoulders, triceps', status: 'Done' },
    { icon: '🥊', title: 'Wednesday · Boxing', meta: 'Skill + bag work', status: 'Done' },
    { icon: '🏋️', title: 'Thursday · Pull', meta: 'Back + biceps', status: 'Today' },
    { icon: '🏋️', title: 'Friday · Upper', meta: 'Chest + back + arms', status: 'Upcoming' },
    { icon: '🏋️', title: 'Saturday · Legs + boxing', meta: 'Lower body + boxing', status: 'Upcoming' },
    { icon: '☁️', title: 'Sunday · Rest', meta: 'Recovery day', status: 'Rest' },
  ],
  todayWorkout: [
    { name: 'Pull-ups', detail: '3 sets · 6–10 reps', tag: 'Compound' },
    { name: 'Lat pulldown', detail: '3 sets · 8–12 reps', tag: 'Back' },
    { name: 'Chest-supported row', detail: '3 sets · 8–12 reps', tag: 'Back' },
    { name: 'Seated cable row', detail: '2 sets · 10–12 reps', tag: 'Back' },
    { name: 'Incline dumbbell curl', detail: '3 sets · 10–12 reps', tag: 'Biceps' },
    { name: 'Hammer curl', detail: '2 sets · 10–12 reps', tag: 'Biceps' },
  ],
  // An unlogged lift shows an em dash rather than a guess: the PRD forbids
  // assuming performance that was never recorded.
  strength: [
    { name: 'Flat barbell bench press', meta: 'Best recent working set', value: '60 kg × 8' },
    { name: 'Pull-ups', meta: 'Best recent set', value: '8 reps' },
    { name: 'Squat', meta: 'Last logged session', value: '—' },
  ],
  sessionsCompleted: '16',
  adherence: '82%',
  consistency: [
    { label: 'W1', value: 58 },
    { label: 'W2', value: 82 },
    { label: 'W3', value: 70 },
    { label: 'W4', value: 90, current: true },
  ],
} as const;
