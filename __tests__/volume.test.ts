import { estimateOneRepMax } from '@/domain/e1rm';
import { setVolumeKg, totalVolumeKg } from '@/domain/volume';

describe('e1rm', () => {
  it('uses Epley and returns the weight for a single', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 10)).toBeCloseTo(133.33, 2);
    expect(estimateOneRepMax(100, 0)).toBeNull();
    expect(estimateOneRepMax(null, 5)).toBeNull();
  });
});

describe('volume', () => {
  it('counts weight * reps only for loaded rep exercises', () => {
    expect(setVolumeKg('weight_reps', { weightKg: 100, reps: 5 })).toBe(500);
    expect(setVolumeKg('weighted_bodyweight', { weightKg: 20, reps: 8 })).toBe(160);
    expect(setVolumeKg('bodyweight_reps', { weightKg: null, reps: 20 })).toBe(0);
    expect(setVolumeKg('duration', { weightKg: null, reps: null })).toBe(0);
  });
  it('totals sets', () => {
    const base = { setType: 'normal' as const, durationS: null, distanceM: null, rpe: null };
    expect(
      totalVolumeKg([
        { ...base, exerciseType: 'weight_reps', weightKg: 60, reps: 10 },
        { ...base, exerciseType: 'bodyweight_reps', weightKg: null, reps: 10 },
      ]),
    ).toBe(600);
  });
});
