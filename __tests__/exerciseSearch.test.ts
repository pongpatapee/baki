import { filterExercises, normalizeText, scoreMatch, sortByName, tokenize } from '@/domain/exerciseSearch';
import type { Equipment, MuscleGroup } from '@/domain/types';

function ex(name: string, equipment: Equipment, primaryMuscle: MuscleGroup, secondaryMuscles: MuscleGroup[] = []) {
  return { name, equipment, primaryMuscle, secondaryMuscles };
}

const LIST = [
  ex('Bench Press (Barbell)', 'barbell', 'chest', ['triceps', 'shoulders']),
  ex('Incline Bench Press (Dumbbell)', 'dumbbell', 'chest', ['shoulders', 'triceps']),
  ex('Bench Dip', 'none', 'triceps', ['chest']),
  ex('Push Up', 'none', 'chest', ['triceps']),
  ex('Triceps Pushdown', 'cable', 'triceps'),
  ex('Romanian Deadlift (Barbell)', 'barbell', 'hamstrings', ['glutes']),
  ex('T Bar Row', 'barbell', 'upper_back', ['lats']),
  ex('Café Curl', 'dumbbell', 'biceps'),
];

const names = (l: { name: string }[]) => l.map((e) => e.name);

describe('normalizeText / tokenize', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeText('  Bench Press - Close Grip (Barbell) ')).toBe('bench press close grip barbell');
    expect(normalizeText('Café')).toBe('cafe');
    expect(tokenize('Iso-Lateral Row')).toEqual(['iso', 'lateral', 'row']);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('scoreMatch', () => {
  it('ranks exact < name prefix < word prefix < substring', () => {
    expect(scoreMatch('Push Up', 'push up')).toBe(0);
    expect(scoreMatch('Bench Press (Barbell)', 'bench')).toBe(1);
    expect(scoreMatch('Incline Bench Press (Dumbbell)', 'bench')).toBe(2);
    expect(scoreMatch('Triceps Pushdown', 'down')).toBe(3);
  });
  it('matches tokens in any order', () => {
    expect(scoreMatch('Incline Bench Press (Dumbbell)', 'dumbbell incline')).not.toBeNull();
    expect(scoreMatch('Bench Press (Barbell)', 'dumbbell bench')).toBeNull();
  });
  it('ignores spaces and punctuation in the query', () => {
    expect(scoreMatch('Push Up', 'pushup')).not.toBeNull();
    expect(scoreMatch('T Bar Row', 't-bar')).not.toBeNull();
    expect(scoreMatch('T Bar Row', 'tbar')).not.toBeNull();
  });
  it('expands common abbreviations', () => {
    expect(scoreMatch('Romanian Deadlift (Barbell)', 'rdl')).not.toBeNull();
    expect(scoreMatch('Incline Bench Press (Dumbbell)', 'incline db')).not.toBeNull();
  });
  it('returns null for non-matches', () => {
    expect(scoreMatch('Push Up', 'squat')).toBeNull();
  });
});

describe('filterExercises', () => {
  it('orders prefix matches first, then alphabetical', () => {
    expect(names(filterExercises(LIST, { query: 'bench' }))).toEqual([
      'Bench Dip',
      'Bench Press (Barbell)',
      'Incline Bench Press (Dumbbell)',
    ]);
  });
  it('filters by primary or secondary muscle, primary first', () => {
    expect(names(filterExercises(LIST, { muscle: 'triceps' }))).toEqual([
      'Bench Dip',
      'Triceps Pushdown',
      'Bench Press (Barbell)',
      'Incline Bench Press (Dumbbell)',
      'Push Up',
    ]);
  });
  it('filters by equipment and combines with query', () => {
    expect(names(filterExercises(LIST, { equipment: 'barbell' }))).toEqual([
      'Bench Press (Barbell)',
      'Romanian Deadlift (Barbell)',
      'T Bar Row',
    ]);
    expect(names(filterExercises(LIST, { equipment: 'barbell', query: 'row' }))).toEqual(['T Bar Row']);
  });
  it('matches accented names with plain queries', () => {
    expect(names(filterExercises(LIST, { query: 'cafe' }))).toEqual(['Café Curl']);
  });
  it('returns everything alphabetically with no filters', () => {
    expect(names(filterExercises(LIST, {}))).toEqual(names(sortByName(LIST)));
  });
});
