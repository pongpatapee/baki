import { calculatePlates, loadIncrement, plateSetupToKg, resolvePlateSetup } from '@/domain/plates';
import { generateWarmups } from '@/domain/warmup';

const KG = [25, 20, 15, 10, 5, 2.5, 1.25];

describe('calculatePlates', () => {
  it('loads standard kg weights exactly', () => {
    const r = calculatePlates(142.5, 20, KG);
    expect(r.perSide).toEqual([
      { plate: 25, count: 2 },
      { plate: 10, count: 1 },
      { plate: 1.25, count: 1 },
    ]);
    expect(r.achieved).toBe(142.5);
    expect(r.remainder).toBe(0);
  });

  it('avoids float drift with fractional plates', () => {
    const r = calculatePlates(23.75, 20, [1.25, 0.5, 0.25]);
    expect(r.perSideList).toEqual([1.25, 0.5]);
    expect(r.achieved).toBeCloseTo(23.5, 10);
    expect(r.remainder).toBeCloseTo(0.25, 10);
  });

  it('finds exact loads where greedy fails', () => {
    const r = calculatePlates(60, 20, [15, 10]);
    expect(r.perSideList).toEqual([10, 10]);
    expect(r.remainder).toBe(0);
  });

  it('reports remainder when not achievable', () => {
    const r = calculatePlates(101, 20, KG);
    expect(r.achieved).toBe(100);
    expect(r.remainder).toBe(1);
  });

  it('handles below-bar, bar-only and no plates', () => {
    expect(calculatePlates(10, 20, KG)).toMatchObject({ belowBar: true, achieved: 20 });
    expect(calculatePlates(20, 20, KG)).toMatchObject({ belowBar: false, perSide: [], remainder: 0 });
    expect(calculatePlates(100, 20, [])).toMatchObject({ achieved: 20, remainder: 80 });
  });

  it('works in lb', () => {
    const r = calculatePlates(315, 45, [45, 35, 25, 10, 5, 2.5]);
    expect(r.perSide).toEqual([{ plate: 45, count: 3 }]);
    expect(calculatePlates(230, 45, [45, 35, 25, 10, 5, 2.5]).perSideList).toEqual([45, 45, 2.5]);
  });

  it('computes the load increment', () => {
    expect(loadIncrement(KG)).toBe(2.5);
    expect(loadIncrement([])).toBe(0);
  });
});

describe('resolvePlateSetup', () => {
  it('uses the standard lb set when the kg default was never customised', () => {
    expect(resolvePlateSetup(20, KG, 'lb')).toEqual({ bar: 45, plates: [45, 35, 25, 10, 5, 2.5], isDefault: true });
    expect(resolvePlateSetup(20, KG, 'kg').isDefault).toBe(true);
  });
  it('round-trips customised lb setups through kg storage', () => {
    const stored = plateSetupToKg(45, [45, 25, 10, 5, 2.5, 1.25], 'lb');
    const back = resolvePlateSetup(stored.barWeightKg, stored.availablePlatesKg, 'lb');
    expect(back.bar).toBe(45);
    expect(back.plates).toEqual([45, 25, 10, 5, 2.5, 1.25]);
    expect(back.isDefault).toBe(false);
  });
});

describe('generateWarmups', () => {
  it('generates bar, 40/60/80% rounded to the increment', () => {
    expect(generateWarmups(100, 20, 2.5).map((w) => [w.weight, w.reps])).toEqual([
      [20, 10],
      [40, 5],
      [60, 3],
      [80, 2],
    ]);
    expect(generateWarmups(142.5, 20, 2.5).map((w) => w.weight)).toEqual([20, 57.5, 85, 115]);
  });

  it('dedupes and drops sets at or above working weight', () => {
    expect(generateWarmups(40, 20, 2.5).map((w) => [w.weight, w.reps])).toEqual([
      [20, 10],
      [25, 3],
      [32.5, 2],
    ]);
    expect(generateWarmups(20, 20, 2.5)).toEqual([]);
  });

  it('works without a bar and with lb increments', () => {
    expect(generateWarmups(50, 0, 2).map((w) => w.weight)).toEqual([20, 30, 40]);
    expect(generateWarmups(225, 45, 5).map((w) => w.weight)).toEqual([45, 90, 135, 180]);
  });
});
