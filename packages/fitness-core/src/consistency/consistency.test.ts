import { describe, expect, it } from 'vitest';

import {
  type ConditioningRecord,
  ConsistencyError,
  type PlanVersion,
  type SessionRecord,
  addDays,
  classifyDay,
  isoWeekdayOf,
  summariseWeek,
  weekStart,
} from './consistency';

// The seeded programme. 2026-11-23 is a Monday.
const PLAN: PlanVersion = {
  effectiveFrom: '2026-11-01',
  effectiveTo: null,
  days: [
    { weekday: 1, kind: 'striking', templateId: null },
    { weekday: 2, kind: 'gym', templateId: 'push' },
    { weekday: 3, kind: 'striking', templateId: null },
    { weekday: 4, kind: 'gym', templateId: 'pull' },
    { weekday: 5, kind: 'optional', templateId: null },
    { weekday: 6, kind: 'gym', templateId: 'upper' },
    { weekday: 7, kind: 'recovery', templateId: null },
  ],
};

const MON = '2026-11-23';
const TUE = '2026-11-24';
const WED = '2026-11-25';
const THU = '2026-11-26';
const FRI = '2026-11-27';
const SAT = '2026-11-28';
const SUN = '2026-11-29';

function session(overrides: Partial<SessionRecord> & Pick<SessionRecord, 'performedOn'>): SessionRecord {
  return {
    templateId: 'push',
    kind: 'gym',
    scheduledFor: overrides.performedOn,
    status: 'completed',
    hasWorkingSets: true,
    ...overrides,
  };
}

const status = (
  date: string,
  today: string,
  sessions: SessionRecord[] = [],
  conditioning: ConditioningRecord[] = [],
  plans: PlanVersion[] = [PLAN],
) => classifyDay(date, today, plans, sessions, conditioning).status;

describe('calendar helpers', () => {
  it('knows ISO weekdays', () => {
    expect(isoWeekdayOf(MON)).toBe(1);
    expect(isoWeekdayOf(SUN)).toBe(7);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('finds the Monday of a week', () => {
    expect(weekStart(SUN)).toBe(MON);
    expect(weekStart(MON)).toBe(MON);
  });

  it('rejects a timestamp where a date is expected', () => {
    expect(() => isoWeekdayOf('2026-11-23T10:00:00Z')).toThrow(ConsistencyError);
  });
});

describe('gym days', () => {
  it('a completed session for the template is done', () => {
    expect(status(TUE, FRI, [session({ performedOn: TUE })])).toBe('done');
  });

  it('a past gym day with nothing logged is missed', () => {
    expect(status(TUE, FRI)).toBe('missed');
  });

  it('today is never missed, even with nothing logged', () => {
    expect(status(TUE, TUE)).toBe('upcoming');
  });

  it('a future gym day is upcoming', () => {
    expect(status(SAT, FRI)).toBe('upcoming');
  });

  it('a skip is recorded as skipped, not missed', () => {
    expect(status(TUE, FRI, [session({ performedOn: TUE, status: 'skipped', hasWorkingSets: false })])).toBe(
      'skipped',
    );
  });

  it('a skip can be entered ahead of the day', () => {
    expect(status(SAT, FRI, [session({ performedOn: SAT, templateId: 'upper', status: 'skipped' })])).toBe(
      'skipped',
    );
  });

  it('a session for a different template does not satisfy the day', () => {
    expect(status(TUE, FRI, [session({ performedOn: TUE, templateId: 'pull' })])).toBe('missed');
  });

  it("Tuesday's workout done on Wednesday counts for Tuesday", () => {
    expect(status(TUE, FRI, [session({ performedOn: WED, scheduledFor: TUE })])).toBe('done');
  });

  it('today, started: in progress', () => {
    expect(status(TUE, TUE, [session({ performedOn: TUE, status: 'in_progress' })])).toBe('in_progress');
  });

  it('past, started with working sets, never completed: partial', () => {
    expect(status(TUE, FRI, [session({ performedOn: TUE, status: 'in_progress' })])).toBe('partial');
  });

  it('past, started with no working sets: missed', () => {
    expect(
      status(TUE, FRI, [session({ performedOn: TUE, status: 'in_progress', hasWorkingSets: false })]),
    ).toBe('missed');
  });

  it('completion wins over a stray skip for the same day', () => {
    expect(
      status(TUE, FRI, [
        session({ performedOn: TUE, status: 'skipped' }),
        session({ performedOn: TUE, status: 'completed' }),
      ]),
    ).toBe('done');
  });
});

describe('striking days are active days', () => {
  it('any conditioning session that day is done', () => {
    expect(status(MON, FRI, [], [{ performedOn: MON }])).toBe('done');
  });

  it('nothing logged on a past striking day is missed', () => {
    expect(status(MON, FRI)).toBe('missed');
  });

  it('a skipped striking day is skipped', () => {
    expect(
      status(MON, FRI, [session({ performedOn: MON, templateId: null, kind: 'striking', status: 'skipped' })]),
    ).toBe('skipped');
  });

  it('conditioning on another day does not count', () => {
    expect(status(MON, FRI, [], [{ performedOn: TUE }])).toBe('missed');
  });
});

describe('optional and rest days', () => {
  it('an optional day with nothing logged is never missed', () => {
    expect(status(FRI, SUN)).toBe('optional');
  });

  it('an optional day with conditioning is done', () => {
    expect(status(FRI, SUN, [], [{ performedOn: FRI }])).toBe('done');
  });

  it('a recovery day is rest even if nothing is logged', () => {
    expect(status(SUN, '2026-11-30')).toBe('rest');
  });
});

describe('plan history', () => {
  const OLD: PlanVersion = { ...PLAN, effectiveTo: '2026-11-26' };
  // From Thursday, Tuesday becomes a rest day.
  const NEW: PlanVersion = {
    effectiveFrom: '2026-11-26',
    effectiveTo: null,
    days: PLAN.days.map((d) => (d.weekday === 2 ? { weekday: 2, kind: 'recovery', templateId: null } : d)),
  };

  it('editing the plan does not rewrite a past miss', () => {
    expect(status(TUE, FRI, [], [], [OLD, NEW])).toBe('missed');
  });

  it('the new version applies from its start', () => {
    expect(status('2026-12-01', '2026-12-05', [], [], [OLD, NEW])).toBe('rest');
  });

  it('a date before any plan is unplanned, not missed', () => {
    expect(status('2026-10-20', FRI)).toBe('unplanned');
  });

  it('overlapping versions are an error, not a guess', () => {
    expect(() => status('2026-12-01', '2026-12-05', [], [], [PLAN, NEW])).toThrow(ConsistencyError);
  });
});

describe('week summary', () => {
  it('counts each outcome and excludes rest and optional from planned', () => {
    const week = summariseWeek(WED, FRI, [PLAN], [
      session({ performedOn: TUE }), // Tue done
      session({ performedOn: THU, templateId: 'pull', status: 'in_progress' }), // Thu partial
    ], [{ performedOn: FRI }]); // Mon missed, Wed missed, Fri optional done, Sat upcoming, Sun rest

    expect(week.weekStart).toBe(MON);
    expect(week.planned).toBe(5);
    expect(week.done).toBe(1);
    expect(week.partial).toBe(1);
    expect(week.missed).toBe(2);
    expect(week.skipped).toBe(0);
    expect(week.remaining).toBe(1);
    expect(week.optionalDone).toBe(1);
    expect(week.done + week.partial + week.missed + week.skipped + week.remaining).toBe(week.planned);
  });

  it('every planned day lands in exactly one count, whatever today is', () => {
    for (let i = -1; i <= 8; i++) {
      const today = addDays(MON, i);
      const w = summariseWeek(MON, today, [PLAN], [session({ performedOn: TUE })], []);
      expect(w.done + w.partial + w.missed + w.skipped + w.remaining).toBe(w.planned);
    }
  });
});
