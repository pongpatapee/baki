import { readFileSync } from 'fs';
import { join } from 'path';

import { ExerciseMatcher, nameSimilarity, normalizeExerciseName } from '@/import/exerciseMatch';
import {
  HevyFormatError,
  inferExerciseType,
  parseHevyCsv,
  parseHevyDate,
  setsByExerciseTitle,
} from '@/import/hevyCsv';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('parseHevyDate', () => {
  it('parses Hevy format as local time', () => {
    expect(parseHevyDate('5 Jan 2025, 18:30')).toBe(new Date(2025, 0, 5, 18, 30).getTime());
    expect(parseHevyDate('05 Sept 2024, 07:02')).toBe(new Date(2024, 8, 5, 7, 2).getTime());
    expect(parseHevyDate('Jan 5, 2025, 6:30 PM')).toBe(new Date(2025, 0, 5, 18, 30).getTime());
  });
  it('accepts ISO strings', () => {
    expect(parseHevyDate('2025-01-05 18:30:00')).toBe(new Date(2025, 0, 5, 18, 30).getTime());
    expect(parseHevyDate('2025-01-05T18:30:00Z')).toBe(Date.UTC(2025, 0, 5, 18, 30));
  });
  it('rejects garbage and impossible dates', () => {
    expect(parseHevyDate('not a date')).toBeNull();
    expect(parseHevyDate('31 Feb 2025, 10:00')).toBeNull();
    expect(parseHevyDate('')).toBeNull();
  });
});

describe('parseHevyCsv (kg export)', () => {
  const r = parseHevyCsv(fixture('hevy-sample.csv'));

  it('groups rows into workouts sorted by start', () => {
    expect(r.weightUnit).toBe('kg');
    expect(r.distanceUnit).toBe('km');
    expect(r.workouts.map((w) => w.title)).toEqual(['Push Day', 'Morning Run', 'Pull Day, Heavy', 'Push Day']);
    expect(r.firstStartedAt).toBe(new Date(2025, 0, 5, 18, 30).getTime());
    expect(r.lastStartedAt).toBe(new Date(2025, 0, 12, 18, 15).getTime());
  });

  it('keeps consecutive superset rows as separate exercise blocks', () => {
    const push = r.workouts[0]!;
    expect(push.exercises.map((e) => e.title)).toEqual([
      'Bench Press (Barbell)',
      'Lateral Raise (Dumbbell)',
      'Triceps Pushdown',
      'Lateral Raise (Dumbbell)',
      'Triceps Pushdown',
      'Push Up',
      'Plank',
    ]);
    expect(push.exercises[1]!.supersetId).toBe('0');
    expect(push.description).toBe('Felt strong');
    expect(push.endedAt).toBe(new Date(2025, 0, 5, 19, 42).getTime());
  });

  it('maps set types and values', () => {
    const bench = r.workouts[0]!.exercises[0]!;
    expect(bench.notes).toBe('Pause reps');
    expect(bench.sets.map((s) => s.setType)).toEqual(['warmup', 'normal', 'normal', 'failure']);
    expect(bench.sets[2]).toMatchObject({ weightKg: 82.5, reps: 6, rpe: 8.5 });
    expect(r.workouts[0]!.exercises[3]!.sets[0]!.setType).toBe('drop');
    const run = r.workouts[1]!.exercises[0]!.sets[0]!;
    expect(run.distanceM).toBeCloseTo(5200);
    expect(run.durationS).toBe(1980);
  });

  it('handles quotes, commas and multi-line notes', () => {
    const pull = r.workouts[2]!;
    expect(pull.description).toBe('Back "hurt" a bit, kept it light');
    expect(pull.exercises.find((e) => e.title === 'My Weird Custom Row')!.notes).toBe('multi\nline note');
  });

  it('warns about bad rows without throwing', () => {
    const msgs = r.warnings.map((w) => w.message).join('\n');
    expect(msgs).toMatch(/start_time "not a date"/);
    expect(msgs).toMatch(/Missing exercise_title/);
    expect(msgs).toMatch(/Invalid reps "abc"/);
    expect(r.totalSets).toBe(16);
  });

  it('builds stable, zone-independent import keys', () => {
    const again = parseHevyCsv(fixture('hevy-sample.csv'));
    expect(again.workouts.map((w) => w.importKey)).toEqual(r.workouts.map((w) => w.importKey));
    expect(r.workouts[0]!.importKey).toBe('hevy:2025-01-05T18:30|push day');
    expect(new Set(r.workouts.map((w) => w.importKey)).size).toBe(4);
  });

  it('infers types for custom exercises', () => {
    const by = setsByExerciseTitle(r);
    expect(inferExerciseType(by.get('Bench Press (Barbell)')!)).toBe('weight_reps');
    expect(inferExerciseType(by.get('Push Up')!)).toBe('bodyweight_reps');
    expect(inferExerciseType(by.get('Plank')!)).toBe('duration');
    expect(inferExerciseType(by.get('Running')!)).toBe('distance_duration');
    expect(inferExerciseType(by.get('Farmers Walk')!)).toBe('weight_distance');
  });
});

describe('parseHevyCsv (lb export)', () => {
  it('converts lb and miles to canonical units', () => {
    const r = parseHevyCsv(fixture('hevy-sample-lb.csv'));
    expect(r.weightUnit).toBe('lb');
    expect(r.distanceUnit).toBe('mi');
    const squat = r.workouts[0]!.exercises[0]!;
    expect(squat.sets[1]!.weightKg).toBeCloseTo(102.058, 3);
    const bike = r.workouts[0]!.exercises[1]!.sets[0]!;
    expect(bike.distanceM).toBeCloseTo(4988.97, 1);
    expect(r.warnings).toEqual([]);
  });

  it('handles a BOM, missing optional columns and CRLF', () => {
    const csv = '﻿title,start_time,exercise_title,reps\r\nA,"1 Mar 2025, 10:00",Pull Up,8\r\n';
    const r = parseHevyCsv(csv);
    expect(r.workouts).toHaveLength(1);
    expect(r.workouts[0]!.endedAt).toBeNull();
    expect(r.workouts[0]!.exercises[0]!.sets[0]).toMatchObject({ reps: 8, weightKg: null, setType: 'normal' });
  });

  it('throws a format error for non-Hevy files', () => {
    expect(() => parseHevyCsv('foo,bar\n1,2')).toThrow(HevyFormatError);
  });
});

describe('exercise matching', () => {
  const m = new ExerciseMatcher([
    { id: 'ex_bench', name: 'Bench Press (Barbell)' },
    { id: 'ex_incline', name: 'Incline Bench Press (Barbell)' },
    { id: 'ex_db_bench', name: 'Bench Press (Dumbbell)' },
    { id: 'ex_lat', name: 'Lateral Raise (Dumbbell)' },
    { id: 'ex_pushup', name: 'Push Up' },
  ]);

  it('normalises names', () => {
    expect(normalizeExerciseName('  Bench Press (Barbell) ')).toBe('bench press barbell');
    expect(normalizeExerciseName('Push-Up')).toBe('push up');
  });

  it('finds exact and reordered matches', () => {
    expect(m.exact('bench press (barbell)')?.id).toBe('ex_bench');
    expect(m.exact('Push-up')?.id).toBe('ex_pushup');
    expect(m.exact('Barbell Bench Press')?.id).toBe('ex_bench');
    expect(m.exact('Lateral Raises (Dumbbell)')?.id).toBe('ex_lat');
    expect(m.exact('Cable Fly')).toBeNull();
  });

  it('treats "X (Weighted)" / "X (Assisted)" as "Weighted X" / "Assisted X"', () => {
    const lib = new ExerciseMatcher([
      { id: 'ex_wpu', name: 'Weighted Pull Up' },
      { id: 'ex_apu', name: 'Assisted Pull Up' },
      { id: 'ex_pu', name: 'Pull Up' },
      { id: 'ex_dip', name: 'Weighted Dip' },
    ]);
    expect(lib.exact('Pull Up (Weighted)')?.id).toBe('ex_wpu');
    expect(lib.exact('Pull Up (Assisted)')?.id).toBe('ex_apu');
    expect(lib.exact('Pull-up')?.id).toBe('ex_pu');
    expect(lib.exact('Dips (Weighted)')?.id).toBe('ex_dip');
  });

  it('ranks fuzzy suggestions', () => {
    const s = m.suggest('Bench Press - Close Grip (Barbell)');
    expect(s[0]!.id).toBe('ex_bench');
    expect(nameSimilarity('Lateral Raise', 'Lateral Raise (Dumbbell)')).toBeGreaterThan(0.5);
  });
});

describe('parseHevyCsv line endings', () => {
  const header =
    '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_lbs","reps","distance_km","duration_seconds","rpe"';
  const row = (title: string, start: string, ex: string) =>
    `"${title}","${start}","${start}","","${ex}",,"",0,"normal",100,5,,,`;

  it('handles files that mix CRLF and LF line endings (real Hevy exports do)', () => {
    const text =
      header + '\r\n' +
      row('A', '9 Nov 2026, 17:28', 'Bench Press (Barbell)') + '\r\n' +
      row('B', '8 Nov 2026, 11:00', 'Squat (Barbell)') + '\n' + // bare LF
      row('C', '7 Nov 2026, 10:30', 'Deadlift (Barbell)') + '\r\n';
    const result = parseHevyCsv(text);
    expect(result.warnings).toEqual([]);
    expect(result.workouts.map((w) => w.title).sort()).toEqual(['A', 'B', 'C']);
  });

  it('keeps multi-line quoted notes intact', () => {
    const text =
      header + '\r\n' +
      `"A","9 Nov 2026, 17:28","9 Nov 2026, 17:28","line one\r\nline two","Bench Press (Barbell)",,"",0,"normal",100,5,,,\r\n`;
    const result = parseHevyCsv(text);
    expect(result.warnings).toEqual([]);
    expect(result.workouts[0]?.description).toBe('line one\nline two');
  });
});

describe('exercise name spelling normalization', () => {
  it('treats Hevy spellings and joined words as the same exercise', () => {
    const m = new ExerciseMatcher([
      { id: 'kelso', name: 'Kelso Shrug (Dumbbell)' },
      { id: 'pu', name: 'Push Up' },
    ]);
    expect(m.exact('Kelso Shrug (Dumbell)')?.id).toBe('kelso');
    expect(m.exact('Pushups')?.id).toBe('pu');
  });
});
