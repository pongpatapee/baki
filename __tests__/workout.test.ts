import {
  bestSet,
  columnHeader,
  dayKey,
  fillMissing,
  formatHoursMinutes,
  formatLocalDateTime,
  formatRest,
  formatSetCompact,
  groupByMonth,
  isSetLoggable,
  matchPreviousSets,
  monthGrid,
  parseHoursMinutes,
  parseLocalDateTime,
  parseTimerInput,
  remainingSeconds,
  setColumns,
  summarizeWorkout,
  weekdayInitials,
  workoutDiffersFromRoutine,
  workoutTitleForTime,
  type PlanExercise,
} from '@/domain/workout';

const empty = { weightKg: null, reps: null, durationS: null, distanceM: null };

describe('workoutTitleForTime', () => {
  it('names workouts by time of day', () => {
    expect(workoutTitleForTime(new Date(2026, 0, 1, 7))).toBe('Morning Workout');
    expect(workoutTitleForTime(new Date(2026, 0, 1, 13))).toBe('Afternoon Workout');
    expect(workoutTitleForTime(new Date(2026, 0, 1, 19))).toBe('Evening Workout');
    expect(workoutTitleForTime(new Date(2026, 0, 1, 23))).toBe('Night Workout');
    expect(workoutTitleForTime(new Date(2026, 0, 1, 3))).toBe('Night Workout');
  });
});

describe('columns', () => {
  it('adapts to exercise type', () => {
    expect(setColumns('weight_reps')).toEqual(['weight', 'reps']);
    expect(setColumns('bodyweight_reps')).toEqual(['reps']);
    expect(setColumns('distance_duration')).toEqual(['distance', 'duration']);
    expect(setColumns('weight_distance')).toEqual(['weight', 'distance']);
    expect(columnHeader('weight_reps', 'weight', 'lb', 'km')).toBe('LBS');
    expect(columnHeader('weighted_bodyweight', 'weight', 'kg', 'km')).toBe('+KG');
    expect(columnHeader('distance_duration', 'distance', 'kg', 'mi')).toBe('MI');
  });
});

describe('set values', () => {
  it('checks loggability per type', () => {
    expect(isSetLoggable('weight_reps', { ...empty, weightKg: 100 })).toBe(false);
    expect(isSetLoggable('weight_reps', { ...empty, reps: 5 })).toBe(true);
    expect(isSetLoggable('duration', { ...empty, durationS: 30 })).toBe(true);
    expect(isSetLoggable('distance_duration', { ...empty, distanceM: 1000 })).toBe(true);
    expect(isSetLoggable('weight_distance', { ...empty, weightKg: 40 })).toBe(false);
  });

  it('fills only missing relevant fields', () => {
    const prev = { weightKg: 100, reps: 5, durationS: 60, distanceM: 10 };
    expect(fillMissing('weight_reps', { ...empty, reps: 8 }, prev)).toEqual({ ...empty, weightKg: 100, reps: 8 });
    expect(fillMissing('duration', empty, prev)).toEqual({ ...empty, durationS: 60 });
    expect(fillMissing('weight_reps', empty, null)).toEqual(empty);
  });
});

describe('matchPreviousSets', () => {
  it('matches warm-ups and working sets separately by position', () => {
    const prev = [
      { setType: 'warmup' as const, id: 'w1' },
      { setType: 'normal' as const, id: 'n1' },
      { setType: 'normal' as const, id: 'n2' },
    ];
    const cur = [{ setType: 'warmup' as const }, { setType: 'warmup' as const }, { setType: 'normal' as const }, { setType: 'failure' as const }, { setType: 'normal' as const }];
    expect(matchPreviousSets(cur, prev).map((p) => p?.id ?? null)).toEqual(['w1', null, 'n1', 'n2', null]);
  });
});

describe('formatSetCompact', () => {
  it('formats by type', () => {
    expect(formatSetCompact('weight_reps', { ...empty, weightKg: 100, reps: 5 }, 'kg', 'km')).toBe('100kg × 5');
    expect(formatSetCompact('weight_reps', { ...empty, weightKg: 100, reps: 5 }, 'kg', 'km', { spaced: true })).toBe(
      '100 kg × 5',
    );
    expect(formatSetCompact('bodyweight_reps', { ...empty, reps: 12 }, 'kg', 'km')).toBe('12 reps');
    expect(formatSetCompact('weighted_bodyweight', { ...empty, weightKg: 20, reps: 8 }, 'kg', 'km')).toBe('+20kg × 8');
    expect(formatSetCompact('duration', { ...empty, durationS: 90 }, 'kg', 'km')).toBe('1:30');
    expect(formatSetCompact('distance_duration', { ...empty, distanceM: 2500, durationS: 720 }, 'kg', 'km')).toBe(
      '2.5km · 12:00',
    );
    expect(formatSetCompact('weight_reps', empty, 'kg', 'km')).toBe('-');
  });
});

describe('parseTimerInput', () => {
  it('reads digits right-to-left and accepts colons', () => {
    expect(parseTimerInput('45')).toBe(45);
    expect(parseTimerInput('90')).toBe(90);
    expect(parseTimerInput('130')).toBe(90);
    expect(parseTimerInput('1000')).toBe(600);
    expect(parseTimerInput('10000')).toBe(3600);
    expect(parseTimerInput('1:30')).toBe(90);
    expect(parseTimerInput('')).toBeNull();
    expect(parseTimerInput('abc')).toBeNull();
  });
});

describe('bestSet', () => {
  it('picks the best e1RM working set', () => {
    const sets = [
      { ...empty, setType: 'warmup' as const, weightKg: 140, reps: 5 },
      { ...empty, setType: 'normal' as const, weightKg: 100, reps: 5 },
      { ...empty, setType: 'normal' as const, weightKg: 90, reps: 10 },
    ];
    expect(bestSet('weight_reps', sets)).toBe(sets[2]);
  });
  it('falls back to warm-ups and handles other types', () => {
    const w = [{ ...empty, setType: 'warmup' as const, reps: 10 }];
    expect(bestSet('bodyweight_reps', w)).toBe(w[0]);
    const d = [
      { ...empty, setType: 'normal' as const, durationS: 30 },
      { ...empty, setType: 'normal' as const, durationS: 60 },
    ];
    expect(bestSet('duration', d)).toBe(d[1]);
    expect(bestSet('duration', [])).toBeNull();
  });
});

describe('summarizeWorkout', () => {
  it('totals completed sets only', () => {
    const t = summarizeWorkout({ startedAt: 0, endedAt: 3_600_000 }, [
      {
        exerciseType: 'weight_reps',
        sets: [
          { ...empty, setType: 'normal', weightKg: 100, reps: 5, completed: true },
          { ...empty, setType: 'normal', weightKg: 100, reps: 5, completed: false },
        ],
      },
      { exerciseType: 'bodyweight_reps', sets: [{ ...empty, setType: 'normal', reps: 10, completed: false }] },
    ]);
    expect(t).toEqual({ durationS: 3600, volumeKg: 500, setCount: 1, incompleteSetCount: 2, exerciseCount: 1 });
  });
  it('uses now for in-progress workouts', () => {
    expect(summarizeWorkout({ startedAt: 0, endedAt: null }, [], 5000).durationS).toBe(5);
  });
});

describe('workoutDiffersFromRoutine', () => {
  const plan = (over: Partial<PlanExercise>[] = []): PlanExercise[] => [
    { exerciseId: 'a', supersetGroup: 'g1', sets: [{ setType: 'normal' }, { setType: 'normal' }], ...over[0] },
    { exerciseId: 'b', supersetGroup: 'g1', sets: [{ setType: 'normal' }], ...over[1] },
  ];
  it('ignores group ids, only structure', () => {
    expect(
      workoutDiffersFromRoutine(plan(), plan([{ supersetGroup: 'x' }, { supersetGroup: 'x' }])),
    ).toBe(false);
  });
  it('detects structural changes', () => {
    expect(workoutDiffersFromRoutine(plan(), plan([{ exerciseId: 'c' }]))).toBe(true);
    expect(workoutDiffersFromRoutine(plan(), plan([{ sets: [{ setType: 'normal' }] }]))).toBe(true);
    expect(workoutDiffersFromRoutine(plan(), plan([{ sets: [{ setType: 'warmup' }, { setType: 'normal' }] }]))).toBe(
      true,
    );
    expect(workoutDiffersFromRoutine(plan(), plan([{}, { supersetGroup: null }]))).toBe(true);
    expect(workoutDiffersFromRoutine(plan(), plan().slice(0, 1))).toBe(true);
  });
});

describe('history helpers', () => {
  it('groups by month preserving order', () => {
    const items = [
      { id: 1, startedAt: new Date(2026, 10, 15).getTime() },
      { id: 2, startedAt: new Date(2026, 10, 2).getTime() },
      { id: 3, startedAt: new Date(2026, 9, 30).getTime() },
    ];
    const g = groupByMonth(items);
    expect(g.map((s) => s.title)).toEqual(['November 2026', 'October 2026']);
    expect(g[0]!.data.map((i) => i.id)).toEqual([1, 2]);
  });

  it('builds month grids', () => {
    // November 2026 starts on a Sunday.
    const mon = monthGrid(2026, 10, 1);
    expect(mon[0]!.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(mon[0]![6]!.getDate()).toBe(1);
    expect(mon.every((w) => w.length === 7)).toBe(true);
    const sun = monthGrid(2026, 10, 0);
    expect(sun[0]![0]!.getDate()).toBe(1);
    expect(weekdayInitials(1)[0]).toBe('M');
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('date/time editing', () => {
  it('round-trips local date times', () => {
    const ts = new Date(2026, 10, 18, 7, 5).getTime();
    expect(formatLocalDateTime(ts)).toBe('2026-11-18 07:05');
    expect(parseLocalDateTime('2026-11-18 07:05')).toBe(ts);
    expect(parseLocalDateTime('2026-02-30 07:05')).toBeNull();
    expect(parseLocalDateTime('nope')).toBeNull();
  });
  it('parses durations as h:mm or minutes', () => {
    expect(formatHoursMinutes(4500)).toBe('1:15');
    expect(parseHoursMinutes('1:15')).toBe(4500);
    expect(parseHoursMinutes('75')).toBe(4500);
    expect(parseHoursMinutes('1:75')).toBeNull();
  });
  it('formats rest and remaining time', () => {
    expect(formatRest(90)).toBe('1m 30s');
    expect(formatRest(120)).toBe('2m');
    expect(formatRest(0)).toBe('Off');
    expect(remainingSeconds(10_500, 10_000)).toBe(1);
    expect(remainingSeconds(0, 10_000)).toBe(0);
  });
});
