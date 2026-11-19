/**
 * Parser for Hevy's "Export workouts" CSV.
 *
 * Known columns (header names are matched case-insensitively; optional ones may be missing):
 *   title, start_time, end_time, description, exercise_title, superset_id, exercise_notes,
 *   set_index, set_type, weight_kg | weight_lbs, reps, distance_km | distance_miles,
 *   duration_seconds, rpe
 *
 * Dates look like "5 Jan 2025, 18:30" (local wall-clock time); ISO strings are accepted too.
 * Values are converted to canonical units (kg, meters, seconds). A bad row produces a warning and is
 * skipped; the parser never throws for row-level problems.
 */
import Papa from 'papaparse';

import type { Equipment, ExerciseType, SetType } from '@/domain/types';
import { KG_PER_LB, METERS_PER_MILE } from '@/domain/units';

export interface HevySet {
  index: number;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceM: number | null;
  durationS: number | null;
  rpe: number | null;
}

export interface HevyExercise {
  title: string;
  supersetId: string | null;
  notes: string | null;
  sets: HevySet[];
}

export interface HevyWorkout {
  title: string;
  startedAt: number;
  endedAt: number | null;
  description: string | null;
  exercises: HevyExercise[];
  /** Stable key so re-importing the same export never duplicates workouts. */
  importKey: string;
}

export interface HevyWarning {
  /** 1-based line number in the file (header is line 1). */
  line: number;
  message: string;
}

export interface HevyParseResult {
  workouts: HevyWorkout[];
  warnings: HevyWarning[];
  weightUnit: 'kg' | 'lb' | null;
  distanceUnit: 'km' | 'mi' | null;
  totalSets: number;
  /** Distinct exercise titles, in first-seen order. */
  exerciseTitles: string[];
  /** Earliest / latest workout start, null when there are no workouts. */
  firstStartedAt: number | null;
  lastStartedAt: number | null;
}

export class HevyFormatError extends Error {}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

interface LocalParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function partsToMs(p: LocalParts): number | null {
  const date = new Date(p.y, p.mo, p.d, p.h, p.mi, p.s);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== p.mo || date.getDate() !== p.d) return null;
  return date.getTime();
}

function parseParts(raw: string): LocalParts | 'iso-zoned' | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  // "5 Jan 2025, 18:30" / "05 Jan 2025 18:30:12"
  let m = /^(\d{1,2}) ([A-Za-z]{3,9})\.? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?(?: ?([AaPp][Mm]))?$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2]!.slice(0, m[2]!.toLowerCase().startsWith('sept') ? 4 : 3).toLowerCase()];
    if (mo === undefined) return null;
    return { y: +m[3]!, mo, d: +m[1]!, h: to24(+m[4]!, m[7]), mi: +m[5]!, s: m[6] ? +m[6] : 0 };
  }
  // "Jan 5, 2025, 18:30"
  m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?(?: ?([AaPp][Mm]))?$/.exec(s);
  if (m) {
    const mo = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    if (mo === undefined) return null;
    return { y: +m[3]!, mo, d: +m[2]!, h: to24(+m[4]!, m[7]), mi: +m[5]!, s: m[6] ? +m[6] : 0 };
  }
  // ISO-ish without zone: "2025-01-05 18:30" / "2025-01-05T18:30:00"
  m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(s);
  if (m) return { y: +m[1]!, mo: +m[2]! - 1, d: +m[3]!, h: +m[4]!, mi: +m[5]!, s: m[6] ? +m[6] : 0 };
  // ISO with zone ("Z" or "+01:00"): an absolute instant.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) return 'iso-zoned';
  return null;
}

function to24(h: number, ampm: string | undefined): number {
  if (!ampm) return h;
  const pm = ampm.toLowerCase() === 'pm';
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

/** Parses a Hevy timestamp into epoch ms (local time for zone-less values). */
export function parseHevyDate(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const p = parseParts(raw);
  if (p == null) return null;
  if (p === 'iso-zoned') {
    const t = Date.parse(raw.trim());
    return Number.isNaN(t) ? null : t;
  }
  return partsToMs(p);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Zone-independent "YYYY-MM-DDTHH:mm" form of a timestamp, used in import keys. */
function canonicalStamp(raw: string, ms: number): string {
  const p = parseParts(raw);
  if (p && p !== 'iso-zoned') return `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
  return new Date(ms).toISOString().slice(0, 16) + 'Z';
}

export function normalizeTitle(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function hevyImportKey(startRaw: string, startedAt: number, title: string): string {
  return `hevy:${canonicalStamp(startRaw, startedAt)}|${normalizeTitle(title)}`;
}

function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let t = raw.trim();
  if (!t) return null;
  // Accept a comma decimal separator ("72,5") when there is no dot.
  if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return Number.NaN;
  return Number(t);
}

function parseSetType(raw: string | undefined): SetType | null {
  const t = (raw ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
  if (t === '' || t === 'normal' || t === 'working') return 'normal';
  if (t === 'warmup' || t === 'w') return 'warmup';
  if (t === 'failure' || t === 'f') return 'failure';
  if (t === 'dropset' || t === 'drop' || t === 'd') return 'drop';
  return null;
}

const nonEmpty = (s: string | undefined): string | null => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/** Parses the whole CSV text. Throws HevyFormatError only when the file isn't a Hevy export at all. */
export function parseHevyCsv(text: string): HevyParseResult {
  const clean = text.replace(/^﻿/, '');
  const parsed = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.replace(/^﻿/, '').trim().toLowerCase(),
  });
  const fields = parsed.meta.fields ?? [];
  const has = (f: string) => fields.includes(f);
  for (const required of ['title', 'start_time', 'exercise_title']) {
    if (!has(required)) {
      throw new HevyFormatError(
        `This doesn't look like a Hevy export: missing the "${required}" column.`,
      );
    }
  }

  const weightCol = has('weight_kg') ? 'weight_kg' : has('weight_lbs') ? 'weight_lbs' : has('weight_lb') ? 'weight_lb' : null;
  const weightUnit: 'kg' | 'lb' | null = weightCol == null ? null : weightCol === 'weight_kg' ? 'kg' : 'lb';
  const distCol = has('distance_km')
    ? 'distance_km'
    : has('distance_miles')
      ? 'distance_miles'
      : has('distance_mi')
        ? 'distance_mi'
        : has('distance_meters')
          ? 'distance_meters'
          : null;
  const distanceUnit: 'km' | 'mi' | null = distCol == null ? null : distCol === 'distance_km' || distCol === 'distance_meters' ? 'km' : 'mi';
  const distFactor = distCol === 'distance_km' ? 1000 : distCol === 'distance_meters' ? 1 : METERS_PER_MILE;
  const weightFactor = weightUnit === 'lb' ? KG_PER_LB : 1;

  const warnings: HevyWarning[] = [];
  for (const e of parsed.errors) {
    // Papa's row index is 0-based over data rows.
    warnings.push({ line: (e.row ?? 0) + 2, message: e.message });
  }

  const workouts = new Map<string, HevyWorkout & { _lastKey: string | null }>();
  const titles: string[] = [];
  const titleSeen = new Set<string>();
  let totalSets = 0;

  parsed.data.forEach((row, i) => {
    const line = i + 2;
    const title = nonEmpty(row.title) ?? 'Workout';
    const startRaw = row.start_time ?? '';
    const startedAt = parseHevyDate(startRaw);
    if (startedAt == null) {
      warnings.push({ line, message: `Unrecognised start_time "${startRaw.trim()}"; row skipped.` });
      return;
    }
    const exTitle = nonEmpty(row.exercise_title);
    if (!exTitle) {
      warnings.push({ line, message: 'Missing exercise_title; row skipped.' });
      return;
    }
    const setType = parseSetType(row.set_type);
    if (setType == null) {
      warnings.push({ line, message: `Unknown set_type "${row.set_type}"; treated as normal.` });
    }

    const num = (col: string | null, label: string): number | null => {
      if (!col) return null;
      const n = parseNumber(row[col]);
      if (n == null) return null;
      if (!Number.isFinite(n) || n < 0) {
        warnings.push({ line, message: `Invalid ${label} "${row[col]}"; value ignored.` });
        return null;
      }
      return n;
    };
    const weight = num(weightCol, 'weight');
    const reps = num(has('reps') ? 'reps' : null, 'reps');
    const dist = num(distCol, 'distance');
    const dur = num(has('duration_seconds') ? 'duration_seconds' : null, 'duration');
    const rpe = num(has('rpe') ? 'rpe' : null, 'RPE');
    const setIndex = num(has('set_index') ? 'set_index' : null, 'set_index');

    const key = `${startRaw.trim()}\u0000${normalizeTitle(title)}`;
    let w = workouts.get(key);
    if (!w) {
      const endedAt = parseHevyDate(row.end_time);
      if (nonEmpty(row.end_time) && endedAt == null) {
        warnings.push({ line, message: `Unrecognised end_time "${row.end_time}"; using start time.` });
      }
      w = {
        title,
        startedAt,
        endedAt: endedAt != null && endedAt >= startedAt ? endedAt : null,
        description: nonEmpty(row.description),
        exercises: [],
        importKey: hevyImportKey(startRaw, startedAt, title),
        _lastKey: null,
      };
      workouts.set(key, w);
    }

    const supersetId = nonEmpty(row.superset_id);
    const exKey = `${exTitle}\u0000${supersetId ?? ''}`;
    let ex = w._lastKey === exKey ? w.exercises[w.exercises.length - 1] : undefined;
    if (!ex) {
      ex = { title: exTitle, supersetId, notes: nonEmpty(row.exercise_notes), sets: [] };
      w.exercises.push(ex);
      w._lastKey = exKey;
    }
    if (!titleSeen.has(exTitle)) {
      titleSeen.add(exTitle);
      titles.push(exTitle);
    }

    ex.sets.push({
      index: setIndex ?? ex.sets.length,
      setType: setType ?? 'normal',
      weightKg: weight == null ? null : weight * weightFactor,
      reps: reps == null ? null : Math.round(reps),
      distanceM: dist == null ? null : dist * distFactor,
      durationS: dur == null ? null : Math.round(dur),
      rpe: rpe != null && rpe > 0 && rpe <= 10 ? rpe : null,
    });
    totalSets += 1;
  });

  const list: HevyWorkout[] = [...workouts.values()]
    .map(({ _lastKey, ...w }) => ({
      ...w,
      exercises: w.exercises.map((e) => ({ ...e, sets: [...e.sets].sort((a, b) => a.index - b.index) })),
    }))
    .sort((a, b) => a.startedAt - b.startedAt);

  return {
    workouts: list,
    warnings,
    weightUnit,
    distanceUnit,
    totalSets,
    exerciseTitles: titles,
    firstStartedAt: list.length ? list[0]!.startedAt : null,
    lastStartedAt: list.length ? list[list.length - 1]!.startedAt : null,
  };
}

/** Best-guess exercise type for a custom exercise, from which columns its sets used. */
export function inferExerciseType(sets: readonly HevySet[]): ExerciseType {
  let w = 0;
  let r = 0;
  let d = 0;
  let t = 0;
  for (const s of sets) {
    if (s.weightKg != null && s.weightKg > 0) w++;
    if (s.reps != null && s.reps > 0) r++;
    if (s.distanceM != null && s.distanceM > 0) d++;
    if (s.durationS != null && s.durationS > 0) t++;
  }
  if (d > 0 && w > 0 && r === 0) return 'weight_distance';
  if (d > 0) return 'distance_duration';
  if (r > 0 && w > 0) return 'weight_reps';
  if (r > 0) return 'bodyweight_reps';
  if (t > 0) return 'duration';
  return 'weight_reps';
}

/** All sets per exercise title across the parsed file (used for type inference). */
export function setsByExerciseTitle(result: HevyParseResult): Map<string, HevySet[]> {
  const map = new Map<string, HevySet[]>();
  for (const w of result.workouts)
    for (const e of w.exercises) {
      const list = map.get(e.title) ?? [];
      list.push(...e.sets);
      map.set(e.title, list);
    }
  return map;
}

const EQUIPMENT_HINTS: [RegExp, Equipment][] = [
  [/\bbarbell\b|\bez bar\b|\btrap bar\b|\bsmith\b/i, 'barbell'],
  [/\bdumbbells?\b/i, 'dumbbell'],
  [/\bkettlebells?\b/i, 'kettlebell'],
  [/\bcable\b/i, 'cable'],
  [/\bmachine\b|\blever\b/i, 'machine'],
  [/\bplate\b/i, 'plate'],
  [/\bband\b/i, 'resistance_band'],
  [/\btrx\b|\bsuspension\b/i, 'suspension'],
  [/\bbodyweight\b/i, 'none'],
];

/** Guesses equipment from a Hevy-style name such as "Bench Press (Barbell)". */
export function inferEquipment(title: string, type: ExerciseType): Equipment {
  const paren = /\(([^)]+)\)\s*$/.exec(title)?.[1] ?? '';
  for (const [re, eq] of EQUIPMENT_HINTS) if (re.test(paren)) return eq;
  for (const [re, eq] of EQUIPMENT_HINTS) if (re.test(title)) return eq;
  return type === 'bodyweight_reps' || type === 'duration' || type === 'distance_duration' ? 'none' : 'other';
}
