import {
  addWeeks,
  exerciseSessions,
  headlineStats,
  isoWeek,
  metricSeries,
  muscleDistribution,
  rangeStart,
  topExercises,
  weeklyBuckets,
  weeklyStreak,
  weekStart,
  type StatSet,
  type StatWorkout,
} from '@/domain/stats';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

let n = 0;
function s(workoutId: string, startedAt: number, partial: Partial<StatSet> = {}): StatSet {
  n += 1;
  return {
    workoutId,
    workoutTitle: workoutId,
    startedAt,
    exerciseId: 'bench',
    exerciseType: 'weight_reps',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    setId: `s${n}`,
    setType: 'normal',
    weightKg: 100,
    reps: 5,
    durationS: null,
    distanceM: null,
    rpe: null,
    completedAt: startedAt,
    ...partial,
  };
}
const w = (id: string, startedAt: number, minutes = 60): StatWorkout => ({
  id,
  title: id,
  startedAt,
  endedAt: startedAt + minutes * 60_000,
});

describe('weeks', () => {
  it('starts weeks on Monday local time', () => {
    // 2025-01-05 is a Sunday
    expect(weekStart(at(2025, 1, 5))).toBe(new Date(2024, 11, 30).getTime());
    expect(weekStart(at(2025, 1, 6, 0))).toBe(new Date(2025, 0, 6).getTime());
    expect(addWeeks(new Date(2025, 2, 24).getTime(), 1)).toBe(new Date(2025, 2, 31).getTime());
  });
  it('computes ISO week numbers', () => {
    expect(isoWeek(at(2025, 1, 1))).toEqual({ year: 2025, week: 1 });
    expect(isoWeek(at(2024, 12, 30))).toEqual({ year: 2025, week: 1 });
    expect(isoWeek(at(2021, 1, 3))).toEqual({ year: 2020, week: 53 });
  });
});

describe('ranges', () => {
  it('goes back calendar months from local midnight', () => {
    expect(rangeStart('1M', at(2025, 3, 31))).toBe(new Date(2025, 1, 28).getTime());
    expect(rangeStart('1Y', at(2025, 6, 15))).toBe(new Date(2024, 5, 15).getTime());
    expect(rangeStart('ALL', at(2025, 6, 15))).toBeNull();
  });
});

describe('weeklyBuckets', () => {
  it('fills gaps and totals per week', () => {
    const now = at(2025, 1, 22);
    const workouts = [w('a', at(2025, 1, 6)), w('b', at(2025, 1, 8), 30), w('c', at(2025, 1, 21))];
    const sets = [
      s('a', at(2025, 1, 6)),
      s('a', at(2025, 1, 6), { setType: 'warmup', weightKg: 50, reps: 10 }),
      s('b', at(2025, 1, 8)),
      s('c', at(2025, 1, 21), { exerciseType: 'bodyweight_reps', weightKg: null, reps: 10 }),
    ];
    const b = weeklyBuckets(workouts, sets, 'ALL', now);
    expect(b.map((x) => x.workouts)).toEqual([2, 0, 1]);
    expect(b[0]).toMatchObject({ volumeKg: 1500, sets: 2, durationS: 5400 });
    expect(b[2]).toMatchObject({ volumeKg: 0, sets: 1 });
  });
  it('returns nothing without workouts for all-time', () => {
    expect(weeklyBuckets([], [], 'ALL', Date.now())).toEqual([]);
  });
});

describe('weeklyStreak', () => {
  const now = at(2025, 1, 22); // Wednesday
  it('counts consecutive weeks and tolerates an in-progress week', () => {
    expect(weeklyStreak([at(2025, 1, 7), at(2025, 1, 14), at(2025, 1, 15)], now)).toEqual({ current: 2, longest: 2 });
    expect(weeklyStreak([at(2025, 1, 7), at(2025, 1, 14), at(2025, 1, 20)], now)).toEqual({ current: 3, longest: 3 });
  });
  it('breaks when a full week is missed', () => {
    expect(weeklyStreak([at(2024, 12, 3), at(2024, 12, 9), at(2025, 1, 7)], now)).toEqual({ current: 0, longest: 2 });
    expect(weeklyStreak([], now)).toEqual({ current: 0, longest: 0 });
  });
});

describe('aggregations', () => {
  const sets = [
    s('a', at(2025, 1, 6)),
    s('a', at(2025, 1, 6), { setType: 'warmup', weightKg: 60 }),
    s('a', at(2025, 1, 6), { exerciseId: 'row', primaryMuscle: 'upper_back', secondaryMuscles: ['biceps'] }),
    s('b', at(2025, 1, 9), { weightKg: 105, reps: 3 }),
  ];

  it('distributes sets across muscles', () => {
    const d = muscleDistribution(sets);
    expect(d.find((x) => x.muscle === 'chest')!.sets).toBe(2);
    expect(d.find((x) => x.muscle === 'triceps')!.sets).toBe(1);
    expect(d.find((x) => x.muscle === 'biceps')!.sets).toBe(0.5);
    expect(d.reduce((a, x) => a + x.fraction, 0)).toBeCloseTo(1);
  });

  it('ranks top exercises', () => {
    const t = topExercises(sets);
    expect(t[0]).toMatchObject({ exerciseId: 'bench', sets: 2, workouts: 2 });
  });

  it('builds per-session series', () => {
    const bench = sets.filter((x) => x.exerciseId === 'bench');
    const sessions = exerciseSessions(bench);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ heaviestWeightKg: 100, bestSetVolumeKg: 500, sessionVolumeKg: 800, totalReps: 10, workingSets: 1 });
    expect(sessions[1]!.bestE1rmKg).toBeCloseTo(115.5);
    expect(metricSeries(sessions, 'heaviest').map((p) => p.value)).toEqual([100, 105]);
    expect(metricSeries(sessions, 'duration')).toEqual([]);
  });

  it('computes headline stats', () => {
    const h = headlineStats([w('a', at(2025, 1, 6)), w('b', at(2025, 1, 9), 45)], sets);
    expect(h).toMatchObject({ workouts: 2, sets: 3, durationS: 6300 });
    expect(h.volumeKg).toBe(500 + 300 + 500 + 315);
  });
});
