import Papa from 'papaparse';

import { buildSetsCsv, type CsvSetRow } from '@/export/csv';
import { buildBackup, serializeBackup, validateBackup, type BackupTables } from '@/export/json';

const ts = { createdAt: 1, updatedAt: 2, deletedAt: null };

function tables(): BackupTables {
  return {
    exercises: [
      {
        id: 'ex_bench_press_barbell',
        name: 'Bench Press (Barbell)',
        exerciseType: 'weight_reps',
        equipment: 'barbell',
        primaryMuscle: 'chest',
        secondaryMuscles: ['triceps'],
        isCustom: false,
        notes: null,
        mergedIntoId: null,
        ...ts,
      },
    ],
    routine_folders: [],
    routines: [],
    routine_exercises: [],
    routine_sets: [],
    workouts: [
      { id: 'w1', routineId: null, title: 'Push', notes: null, startedAt: 1000, endedAt: 2000, importKey: null, ...ts },
      { id: 'w2', routineId: null, title: 'Deleted', notes: null, startedAt: 1000, endedAt: 2000, importKey: null, ...ts, deletedAt: 5 },
    ],
    workout_exercises: [
      { id: 'we1', workoutId: 'w1', exerciseId: 'ex_bench_press_barbell', position: 0, supersetGroup: null, restSeconds: 90, notes: null, ...ts },
    ],
    workout_sets: [
      {
        id: 'ws1',
        workoutExerciseId: 'we1',
        position: 0,
        setType: 'normal',
        weightKg: 100,
        reps: 5,
        durationS: null,
        distanceM: null,
        rpe: 8,
        completedAt: 1500,
        ...ts,
      },
    ],
    settings: [{ key: 'weightUnit', value: '"lb"', updatedAt: 3 }],
  };
}

describe('JSON backup', () => {
  it('round-trips through serialize + validate (including soft-deleted rows)', () => {
    const b = buildBackup(tables(), 123);
    const v = validateBackup(serializeBackup(b));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.backup).toEqual(b);
    expect(v.counts.workouts).toBe(2);
  });

  it('rejects non-backups and newer versions', () => {
    expect(validateBackup('nope')).toEqual({ ok: false, error: 'The file is not valid JSON.' });
    expect(validateBackup({ app: 'hevy' }).ok).toBe(false);
    const v = validateBackup({ ...buildBackup(tables(), 1), formatVersion: 2 });
    expect(!v.ok && v.error).toMatch(/newer version/);
  });

  it('rejects bad fields, enums, duplicates and dangling references', () => {
    const t1 = tables();
    (t1.workout_sets[0] as unknown as Record<string, unknown>).reps = 'five';
    expect(validateBackup(buildBackup(t1, 1))).toEqual({ ok: false, error: 'workout_sets[0].reps must be an integer.' });

    const t2 = tables();
    (t2.exercises[0] as unknown as Record<string, unknown>).exerciseType = 'yoga';
    expect(validateBackup(buildBackup(t2, 1)).ok).toBe(false);

    const t3 = tables();
    t3.workouts.push({ ...t3.workouts[0]! });
    expect(validateBackup(buildBackup(t3, 1))).toEqual({ ok: false, error: 'workouts has a duplicate id "w1".' });

    const t4 = tables();
    t4.workout_exercises[0]!.workoutId = 'missing';
    expect(validateBackup(buildBackup(t4, 1)).ok).toBe(false);
  });

  it('treats missing tables as empty and drops unknown fields', () => {
    const t = tables() as unknown as Record<string, unknown>;
    delete t.routines;
    (t.workouts as Record<string, unknown>[])[0]!.extra = 'x';
    const v = validateBackup({ app: 'baki', formatVersion: 1, exportedAt: 1, tables: t });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.backup.tables.routines).toEqual([]);
      expect('extra' in v.backup.tables.workouts[0]!).toBe(false);
    }
  });
});

describe('CSV export', () => {
  const row: CsvSetRow = {
    workoutTitle: 'Push, "heavy"',
    workoutNotes: null,
    startedAt: new Date(2025, 0, 5, 18, 30).getTime(),
    endedAt: new Date(2025, 0, 5, 19, 45).getTime(),
    exerciseName: 'Bench Press (Barbell)',
    exerciseType: 'weight_reps',
    exerciseNotes: null,
    supersetGroup: null,
    setNumber: 1,
    setType: 'warmup',
    weightKg: 100,
    reps: 5,
    durationS: null,
    distanceM: null,
    rpe: null,
  };

  it('writes canonical and user-unit columns with escaping', () => {
    const csv = buildSetsCsv([row], { weight: 'lb', distance: 'km' });
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true });
    const r = parsed.data[0]!;
    expect(r.workout).toBe('Push, "heavy"');
    expect(r.start_time).toBe('2025-01-05 18:30');
    expect(r.weight_kg).toBe('100');
    expect(r.weight_lb).toBe('220.46');
    expect(r.set_type).toBe('Warm-up');
    expect(r.volume_kg).toBe('500');
    expect(parsed.meta.fields).not.toContain('distance_mi');
  });

  it('omits user-unit columns for kg/km users', () => {
    const csv = buildSetsCsv([row], { weight: 'kg', distance: 'km' });
    expect(csv.split('\r\n')[0]).not.toMatch(/weight_lb/);
  });
});
