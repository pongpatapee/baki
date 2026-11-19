import { computePrProgression, currentBests, prKindsForType, repMaxTable, type PrSetInput } from '@/domain/prs';

let n = 0;
function set(workoutId: string, weightKg: number | null, reps: number | null, extra: Partial<PrSetInput> = {}): PrSetInput {
  n += 1;
  return {
    workoutId,
    setId: `s${n}`,
    achievedAt: n,
    setType: 'normal',
    weightKg,
    reps,
    durationS: null,
    distanceM: null,
    ...extra,
  };
}

describe('prKindsForType', () => {
  it('maps exercise types to kinds', () => {
    expect(prKindsForType('weight_reps')).toEqual(['heaviest_weight', 'best_e1rm', 'best_set_volume']);
    expect(prKindsForType('bodyweight_reps')).toEqual(['most_reps']);
    expect(prKindsForType('assisted_bodyweight')).toEqual(['most_reps']);
    expect(prKindsForType('duration')).toEqual(['longest_duration']);
    expect(prKindsForType('distance_duration')).toEqual(['longest_distance', 'longest_duration']);
  });
});

describe('computePrProgression', () => {
  it('records first-workout bests as PRs', () => {
    const s1 = set('w1', 100, 5);
    const ev = computePrProgression('weight_reps', [set('w1', 60, 10, { setType: 'warmup' }), s1, set('w1', 90, 5)]);
    expect(ev.map((e) => [e.kind, e.value, e.setId, e.previous])).toEqual([
      ['heaviest_weight', 100, s1.setId, null],
      ['best_e1rm', expect.closeTo(116.667, 2), s1.setId, null],
      ['best_set_volume', 500, s1.setId, null],
    ]);
  });

  it('excludes warm-ups, ignores ties and emits one record per workout per kind', () => {
    const a = set('w1', 100, 5);
    const tie = set('w2', 100, 5);
    const warm = set('w3', 200, 1, { setType: 'warmup' });
    const b1 = set('w4', 102.5, 3);
    const b2 = set('w4', 105, 1);
    const ev = computePrProgression('weight_reps', [a, tie, warm, b1, b2]);
    const heavy = ev.filter((e) => e.kind === 'heaviest_weight');
    expect(heavy.map((e) => [e.workoutId, e.value, e.previous])).toEqual([
      ['w1', 100, null],
      ['w4', 105, 100],
    ]);
    expect(ev.some((e) => e.workoutId === 'w2' || e.workoutId === 'w3')).toBe(false);
    // 102.5 x 3 has a lower volume than 100 x 5, so no volume PR in w4.
    expect(ev.filter((e) => e.kind === 'best_set_volume')).toHaveLength(1);
  });

  it('credits the first set reaching the workout best', () => {
    const first = set('w1', 100, 3);
    const second = set('w1', 100, 3);
    const ev = computePrProgression('weight_reps', [first, second]);
    expect(ev[0]!.setId).toBe(first.setId);
  });

  it('handles float noise from lb conversion', () => {
    const a = set('w1', 102.05828325, 5);
    const b = set('w2', 102.05828325 + 1e-12, 5);
    expect(computePrProgression('weight_reps', [a, b]).filter((e) => e.workoutId === 'w2')).toEqual([]);
  });

  it('handles reps, duration and distance types', () => {
    expect(computePrProgression('bodyweight_reps', [set('w1', null, 10), set('w2', null, 12), set('w3', null, 11)]).map((e) => e.value)).toEqual([10, 12]);
    const cardio = computePrProgression('distance_duration', [
      set('w1', null, null, { distanceM: 5000, durationS: 1500 }),
      set('w2', null, null, { distanceM: 5000, durationS: 1600 }),
    ]);
    expect(cardio.map((e) => `${e.workoutId}:${e.kind}`)).toEqual([
      'w1:longest_distance',
      'w1:longest_duration',
      'w2:longest_duration',
    ]);
  });

  it('is deterministic and currentBests picks the latest best', () => {
    const sets = [set('w1', 50, 10), set('w2', 60, 8), set('w3', 55, 12)];
    const a = computePrProgression('weight_reps', sets);
    expect(computePrProgression('weight_reps', sets)).toEqual(a);
    const best = currentBests(a);
    expect(best.get('heaviest_weight')!.value).toBe(60);
    expect(best.get('best_set_volume')!.value).toBe(660);
  });
});

describe('repMaxTable', () => {
  it('propagates heavier sets with more reps down to lower rep counts', () => {
    const t = repMaxTable([set('w1', 100, 5), set('w1', 110, 1), set('w2', 90, 8), set('w2', 200, 3, { setType: 'warmup' })], 10);
    expect(t.map((x) => x?.weightKg ?? null)).toEqual([110, 100, 100, 100, 100, 90, 90, 90, null, null]);
  });
  it('counts reps above the max in the last bucket', () => {
    const t = repMaxTable([set('w1', 40, 20)], 12);
    expect(t[11]!.weightKg).toBe(40);
    expect(t[0]!.weightKg).toBe(40);
  });
});
