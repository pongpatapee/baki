import {
  appendSet,
  copyName,
  defaultSets,
  emptySet,
  formatRest,
  isLinkedWithNext,
  linkWithNext,
  moveItem,
  nextSetType,
  normalizeSupersets,
  removedIds,
  removeFromSuperset,
  setLabel,
  supersetColorIndex,
  workingSetNumbers,
} from '@/domain/routineEdit';

function ids() {
  let n = 0;
  return () => `g${++n}`;
}
const groups = (l: { supersetGroup: string | null }[]) => l.map((e) => e.supersetGroup);
const ex = (...gs: (string | null)[]) => gs.map((g, i) => ({ id: `e${i}`, supersetGroup: g }));

describe('set types', () => {
  it('cycles normal -> warmup -> failure -> drop -> normal', () => {
    expect(nextSetType('normal')).toBe('warmup');
    expect(nextSetType('warmup')).toBe('failure');
    expect(nextSetType('failure')).toBe('drop');
    expect(nextSetType('drop')).toBe('normal');
  });
  it('numbers only normal sets', () => {
    const sets = [{ setType: 'warmup' }, { setType: 'normal' }, { setType: 'normal' }, { setType: 'drop' }, { setType: 'normal' }] as const;
    const nums = workingSetNumbers(sets);
    expect(nums).toEqual([null, 1, 2, null, 3]);
    expect(sets.map((s, i) => setLabel(s.setType, nums[i]!))).toEqual(['W', '1', '2', 'D', '3']);
  });
  it('appendSet copies previous targets with a new id', () => {
    const first = { ...emptySet('a', 'warmup'), targetReps: 8, targetWeightKg: 60 };
    const out = appendSet([first], 'b');
    expect(out[1]).toEqual({ ...first, id: 'b', setType: 'normal' });
    expect(appendSet([], 'c')).toEqual([emptySet('c')]);
  });
});

describe('moveItem', () => {
  it('moves and clamps', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, -5)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 7, 0)).toEqual([1, 2, 3]);
  });
});

describe('supersets', () => {
  it('links two ungrouped exercises with a new group', () => {
    expect(groups(linkWithNext(ex(null, null, null), 0, ids()))).toEqual(['g1', 'g1', null]);
  });
  it('extends an existing superset', () => {
    expect(groups(linkWithNext(ex('a', 'a', null), 1, ids()))).toEqual(['a', 'a', 'a']);
    expect(groups(linkWithNext(ex(null, 'b', 'b'), 0, ids()))).toEqual(['b', 'b', 'b']);
  });
  it('joins two adjacent supersets', () => {
    expect(groups(linkWithNext(ex('a', 'a', 'b', 'b'), 1, ids()))).toEqual(['a', 'a', 'a', 'a']);
  });
  it('ignores linking the last exercise', () => {
    expect(groups(linkWithNext(ex(null, null), 1, ids()))).toEqual([null, null]);
  });
  it('removing from a pair dissolves it', () => {
    expect(groups(removeFromSuperset(ex('a', 'a', null), 0, ids()))).toEqual([null, null, null]);
  });
  it('removing from the middle splits the run', () => {
    expect(groups(removeFromSuperset(ex('a', 'a', 'a', 'a', 'a'), 2, ids()))).toEqual(['a', 'a', null, 'g1', 'g1']);
    expect(groups(removeFromSuperset(ex('a', 'a', 'a'), 1, ids()))).toEqual([null, null, null]);
  });
  it('normalizes non-contiguous and single-member groups', () => {
    expect(groups(normalizeSupersets(ex('a', null, 'b', 'b', 'a', 'a'), ids()))).toEqual([null, null, 'b', 'b', 'a', 'a']);
    expect(groups(normalizeSupersets(ex('a', 'a', null, 'a', 'a'), ids()))).toEqual(['a', 'a', null, 'g1', 'g1']);
  });
  it('reports links and color slots', () => {
    const l = ex('x', 'x', null, 'y', 'y');
    expect([0, 1, 2, 3].map((i) => isLinkedWithNext(l, i))).toEqual([true, false, false, true]);
    expect([...supersetColorIndex(l)]).toEqual([['x', 0], ['y', 1]]);
  });
});

describe('misc', () => {
  it('formats rest times', () => {
    expect(formatRest(null)).toBe('Default');
    expect(formatRest(null, 90)).toBe('Default (1min 30s)');
    expect(formatRest(0)).toBe('Off');
    expect(formatRest(45)).toBe('45s');
    expect(formatRest(120)).toBe('2min');
  });
  it('diffs removed ids', () => {
    expect(removedIds(['a', 'b', 'c'], ['c', 'd'])).toEqual(['a', 'b']);
  });
  it('names copies', () => {
    expect(copyName(' Push ')).toBe('Push (Copy)');
  });
});

describe('defaultSets', () => {
  it('adds one set for cardio and three otherwise', () => {
    expect(defaultSets(ids(), 'distance_duration')).toHaveLength(1);
    const sets = defaultSets(ids(), 'weight_reps');
    expect(sets.map((s) => s.id)).toEqual(['g1', 'g2', 'g3']);
  });
});
