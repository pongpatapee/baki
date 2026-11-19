import { SEED_EXERCISES } from '@/db/seed/exercises';
import { EQUIPMENT, EXERCISE_TYPES, MUSCLE_GROUPS } from '@/domain/types';

const slug = (name: string) => 'ex_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

describe('seed exercise library', () => {
  it('has a substantial library', () => {
    expect(SEED_EXERCISES.length).toBeGreaterThanOrEqual(200);
  });

  it('has unique ids and unique (case-insensitive) names', () => {
    const ids = SEED_EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = SEED_EXERCISES.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * Ids are permanent (workout history points at them), so a renamed exercise keeps its original id.
   * Record each rename here: id -> current name.
   */
  const RENAMED: Record<string, string> = {
    ex_weighted_dip: 'Chest Dip (Weighted)', // seed v2: matched to Hevy's name
  };

  it('uses well-formed ids derived from the name (except recorded renames)', () => {
    for (const e of SEED_EXERCISES) {
      expect(e.id).toMatch(/^ex_[a-z0-9]+(_[a-z0-9]+)*$/);
      if (e.id in RENAMED) expect(e.name).toBe(RENAMED[e.id]);
      else expect(e.id).toBe(slug(e.name));
    }
  });

  it('uses only valid enum values', () => {
    for (const e of SEED_EXERCISES) {
      expect(EXERCISE_TYPES).toContain(e.exerciseType);
      expect(EQUIPMENT).toContain(e.equipment);
      expect(MUSCLE_GROUPS).toContain(e.primaryMuscle);
      for (const m of e.secondaryMuscles) expect(MUSCLE_GROUPS).toContain(m);
      expect(e.secondaryMuscles).not.toContain(e.primaryMuscle);
      expect(new Set(e.secondaryMuscles).size).toBe(e.secondaryMuscles.length);
      expect(e.name.trim()).toBe(e.name);
    }
  });

  it('covers every exercise type and the main muscle groups', () => {
    const types = new Set(SEED_EXERCISES.map((e) => e.exerciseType));
    for (const t of EXERCISE_TYPES) expect(types).toContain(t);
    const primaries = new Set(SEED_EXERCISES.map((e) => e.primaryMuscle));
    for (const m of MUSCLE_GROUPS.filter((m) => m !== 'other')) expect(primaries).toContain(m);
  });

  it('includes well-known Hevy names', () => {
    const names = new Set(SEED_EXERCISES.map((e) => e.name));
    for (const n of ['Bench Press (Barbell)', 'Squat (Barbell)', 'Deadlift (Barbell)', 'Lat Pulldown (Cable)', 'Pull Up', 'Plank', 'Running']) {
      expect(names).toContain(n);
    }
  });
});
