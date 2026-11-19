/**
 * Exercise search, filtering and sorting. Pure functions shared by the exercise library and
 * the exercise picker.
 *
 * Matching is case-, accent- and punctuation-insensitive and token based: every query token must
 * match the start of a word in the name (so "inc db" finds "Incline Bench Press (Dumbbell)"),
 * or appear inside the name with spaces removed (so "pushup" finds "Push Up").
 */
import type { Equipment, MuscleGroup } from './types';

export interface SearchableExercise {
  name: string;
  equipment: Equipment;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
}

export interface ExerciseFilter {
  query?: string;
  muscle?: MuscleGroup | null;
  equipment?: Equipment | null;
}

/** Common gym abbreviations expanded at query time. */
const ALIASES: Record<string, string> = {
  db: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  dl: 'deadlift',
  bw: 'bodyweight',
};

/** Lowercases, strips accents and turns punctuation into single spaces. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(s: string): string[] {
  const n = normalizeText(s);
  return n ? n.split(' ') : [];
}

function expandQueryTokens(tokens: string[]): string[] {
  return tokens.flatMap((tok) => (ALIASES[tok] ? ALIASES[tok].split(' ') : [tok]));
}

/** Rank buckets: lower is better. */
export const MATCH_RANK = {
  exact: 0,
  namePrefix: 1,
  wordPrefix: 2,
  substring: 3,
} as const;

/**
 * Scores how well `name` matches `query`. Returns null when it does not match.
 * An empty query matches everything with the worst rank.
 */
export function scoreMatch(name: string, query: string): number | null {
  const rawTokens = tokenize(query);
  if (rawTokens.length === 0) return MATCH_RANK.substring;
  const normName = normalizeText(name);
  const normQuery = rawTokens.join(' ');
  if (normName === normQuery) return MATCH_RANK.exact;
  if (normName.startsWith(normQuery)) return MATCH_RANK.namePrefix;

  const nameWords = normName.split(' ');
  const compactName = nameWords.join('');
  const queryTokens = expandQueryTokens(rawTokens);

  let allWordPrefix = true;
  for (const tok of queryTokens) {
    if (nameWords.some((w) => w.startsWith(tok))) continue;
    allWordPrefix = false;
    if (!compactName.includes(tok)) {
      // Last chance: the whole query without spaces ("pushup", "tbar") inside the compact name.
      return compactName.includes(rawTokens.join('')) ? MATCH_RANK.substring : null;
    }
  }
  if (allWordPrefix) {
    // Query whose first token starts the name ranks just like a name prefix ("bench db").
    const first = queryTokens[0]!;
    return nameWords[0]!.startsWith(first) ? MATCH_RANK.namePrefix : MATCH_RANK.wordPrefix;
  }
  return MATCH_RANK.substring;
}

export function matchesMuscle(e: Pick<SearchableExercise, 'primaryMuscle' | 'secondaryMuscles'>, muscle: MuscleGroup): boolean {
  return e.primaryMuscle === muscle || e.secondaryMuscles.includes(muscle);
}

/** Case-insensitive natural name comparison. */
export function compareByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
}

export function sortByName<T extends { name: string }>(list: readonly T[]): T[] {
  return [...list].sort(compareByName);
}

/**
 * Applies query + muscle + equipment filters. Results are ordered by match rank (when there is a
 * query), then, with a muscle filter, exercises whose primary muscle is that muscle, then by name.
 */
export function filterExercises<T extends SearchableExercise>(list: readonly T[], filter: ExerciseFilter): T[] {
  const { query = '', muscle, equipment } = filter;
  const hasQuery = tokenize(query).length > 0;
  const scored: { e: T; score: number }[] = [];
  for (const e of list) {
    if (equipment && e.equipment !== equipment) continue;
    if (muscle && !matchesMuscle(e, muscle)) continue;
    const score = hasQuery ? scoreMatch(e.name, query) : 0;
    if (score == null) continue;
    scored.push({ e, score });
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (muscle) {
      const pa = a.e.primaryMuscle === muscle ? 0 : 1;
      const pb = b.e.primaryMuscle === muscle ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    return compareByName(a.e, b.e);
  });
  return scored.map((s) => s.e);
}
