/**
 * Matching imported exercise names (e.g. from Hevy) to the local exercise library.
 * 1. exact match on a normalised name ("Bench Press (Barbell)" == "bench press barbell");
 * 2. otherwise ranked fuzzy suggestions (token overlap + character bigram similarity).
 */

export interface MatchCandidate {
  id: string;
  name: string;
}

export interface MatchSuggestion {
  id: string;
  name: string;
  score: number;
}

/** Lowercase, strip accents/punctuation, collapse whitespace. */
export function normalizeExerciseName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => SPELLING[w] ?? w)
    .join(' ');
}

/** Common misspellings and joined forms in exercise names (Hevy itself exports "Dumbell"). */
const SPELLING: Record<string, string> = {
  dumbell: 'dumbbell',
  dumbells: 'dumbbells',
  pushup: 'push up',
  pushups: 'push ups',
  pullup: 'pull up',
  pullups: 'pull ups',
  chinup: 'chin up',
  chinups: 'chin ups',
  situp: 'sit up',
  situps: 'sit ups',
};

const STOP = new Set(['the', 'a', 'an', 'and', 'with', 'on', 'of']);

function tokens(norm: string): string[] {
  return norm.split(' ').filter((t) => t && !STOP.has(t)).map(singular);
}

function singular(t: string): string {
  if (t === 'ups') return 'up'; // "Push Ups", "Pull Ups", "Sit Ups"
  if (t.length > 3 && t.endsWith('es') && /(ss|x|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/ /g, '');
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function dice(a: Map<string, number>, b: Map<string, number>): number {
  let inter = 0;
  let total = 0;
  for (const v of a.values()) total += v;
  for (const v of b.values()) total += v;
  for (const [g, n] of a) inter += Math.min(n, b.get(g) ?? 0);
  return total === 0 ? 0 : (2 * inter) / total;
}

/** Similarity in 0..1 between two names. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeExerciseName(a);
  const nb = normalizeExerciseName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(tokens(na));
  const tb = new Set(tokens(nb));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;
  if (jaccard === 1) return 0.99; // same words, different order/plurals
  const sim = dice(bigrams(na), bigrams(nb));
  return 0.55 * jaccard + 0.45 * sim;
}

export class ExerciseMatcher {
  private readonly byNorm = new Map<string, MatchCandidate>();
  private readonly byTokens = new Map<string, MatchCandidate>();
  private readonly prepared: { c: MatchCandidate; norm: string }[];

  constructor(candidates: readonly MatchCandidate[]) {
    this.prepared = candidates.map((c) => ({ c, norm: normalizeExerciseName(c.name) }));
    for (const p of this.prepared) {
      if (!this.byNorm.has(p.norm)) this.byNorm.set(p.norm, p.c);
      const key = [...new Set(tokens(p.norm))].sort().join(' ');
      if (!this.byTokens.has(key)) this.byTokens.set(key, p.c);
    }
  }

  /** Exact (normalised) match, or same set of words in any order. */
  exact(name: string): MatchCandidate | null {
    const norm = normalizeExerciseName(name);
    const hit = this.byNorm.get(norm);
    if (hit) return hit;
    return this.byTokens.get([...new Set(tokens(norm))].sort().join(' ')) ?? null;
  }

  suggest(name: string, limit = 5, minScore = 0.35): MatchSuggestion[] {
    return this.prepared
      .map((p) => ({ id: p.c.id, name: p.c.name, score: nameSimilarity(name, p.c.name) }))
      .filter((s) => s.score >= minScore)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, limit);
  }
}
