/**
 * Full JSON backup format (v1) and its validator.
 *
 *   { app: 'baki', formatVersion: 1, exportedAt, tables: { exercises: [...], ..., settings: [...] } }
 *
 * Rows are stored exactly as the database holds them (camelCase field names, canonical units) and
 * include soft-deleted rows, so a restore is lossless. personal_records is derived data and is
 * rebuilt after a restore instead of being backed up.
 */
import type {
  ExerciseRow,
  RoutineExerciseRow,
  RoutineFolderRow,
  RoutineRow,
  RoutineSetRow,
  WorkoutExerciseRow,
  WorkoutRow,
  WorkoutSetRow,
} from '@/db/schema';
import { EQUIPMENT, EXERCISE_TYPES, MUSCLE_GROUPS, SET_TYPES } from '@/domain/types';

export const BACKUP_APP = 'baki';
export const BACKUP_FORMAT_VERSION = 1;

export interface SettingRowData {
  key: string;
  value: string;
  updatedAt: number;
}

export interface BackupTables {
  exercises: ExerciseRow[];
  routine_folders: RoutineFolderRow[];
  routines: RoutineRow[];
  routine_exercises: RoutineExerciseRow[];
  routine_sets: RoutineSetRow[];
  workouts: WorkoutRow[];
  workout_exercises: WorkoutExerciseRow[];
  workout_sets: WorkoutSetRow[];
  settings: SettingRowData[];
}

export type BackupTableName = keyof BackupTables;

/** Insert order that keeps parents before children. */
export const BACKUP_TABLE_NAMES: readonly BackupTableName[] = [
  'exercises',
  'routine_folders',
  'routines',
  'routine_exercises',
  'routine_sets',
  'workouts',
  'workout_exercises',
  'workout_sets',
  'settings',
];

export interface BackupV1 {
  app: typeof BACKUP_APP;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: number;
  tables: BackupTables;
}

export function buildBackup(tables: BackupTables, exportedAt: number): BackupV1 {
  return { app: BACKUP_APP, formatVersion: BACKUP_FORMAT_VERSION, exportedAt, tables };
}

export function serializeBackup(backup: BackupV1): string {
  return JSON.stringify(backup);
}

export function backupFileName(exportedAt: number): string {
  const d = new Date(exportedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `baki-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

// ---------- Validation ----------

type FieldSpec =
  | 'string'
  | 'string?'
  | 'int'
  | 'int?'
  | 'number'
  | 'number?'
  | 'boolean'
  | { enum: readonly string[]; optional?: boolean }
  | { enumArray: readonly string[] };

const ts = { createdAt: 'int', updatedAt: 'int', deletedAt: 'int?' } as const;

const SPECS: Record<BackupTableName, Record<string, FieldSpec>> = {
  exercises: {
    id: 'string',
    name: 'string',
    exerciseType: { enum: EXERCISE_TYPES },
    equipment: { enum: EQUIPMENT },
    primaryMuscle: { enum: MUSCLE_GROUPS },
    secondaryMuscles: { enumArray: MUSCLE_GROUPS },
    isCustom: 'boolean',
    notes: 'string?',
    mergedIntoId: 'string?',
    ...ts,
  },
  routine_folders: { id: 'string', name: 'string', position: 'int', ...ts },
  routines: { id: 'string', folderId: 'string?', name: 'string', notes: 'string?', position: 'int', ...ts },
  routine_exercises: {
    id: 'string',
    routineId: 'string',
    exerciseId: 'string',
    position: 'int',
    supersetGroup: 'string?',
    restSeconds: 'int?',
    notes: 'string?',
    ...ts,
  },
  routine_sets: {
    id: 'string',
    routineExerciseId: 'string',
    position: 'int',
    setType: { enum: SET_TYPES },
    targetWeightKg: 'number?',
    targetReps: 'int?',
    targetDurationS: 'int?',
    targetDistanceM: 'number?',
    ...ts,
  },
  workouts: {
    id: 'string',
    routineId: 'string?',
    title: 'string',
    notes: 'string?',
    startedAt: 'int',
    endedAt: 'int?',
    importKey: 'string?',
    ...ts,
  },
  workout_exercises: {
    id: 'string',
    workoutId: 'string',
    exerciseId: 'string',
    position: 'int',
    supersetGroup: 'string?',
    restSeconds: 'int?',
    notes: 'string?',
    ...ts,
  },
  workout_sets: {
    id: 'string',
    workoutExerciseId: 'string',
    position: 'int',
    setType: { enum: SET_TYPES },
    weightKg: 'number?',
    reps: 'int?',
    durationS: 'int?',
    distanceM: 'number?',
    rpe: 'number?',
    completedAt: 'int?',
    ...ts,
  },
  settings: { key: 'string', value: 'string', updatedAt: 'int' },
};

function checkField(spec: FieldSpec, v: unknown): string | null {
  if (typeof spec === 'string') {
    const optional = spec.endsWith('?');
    if (v === undefined || v === null) return optional ? null : 'is required';
    const base = optional ? spec.slice(0, -1) : spec;
    switch (base) {
      case 'string':
        return typeof v === 'string' ? null : 'must be a string';
      case 'int':
        return typeof v === 'number' && Number.isInteger(v) ? null : 'must be an integer';
      case 'number':
        return typeof v === 'number' && Number.isFinite(v) ? null : 'must be a number';
      case 'boolean':
        return typeof v === 'boolean' ? null : 'must be true/false';
    }
    return 'has an unknown type';
  }
  if ('enum' in spec) {
    if (v == null) return spec.optional ? null : 'is required';
    return typeof v === 'string' && spec.enum.includes(v) ? null : `has an unknown value "${String(v)}"`;
  }
  if (!Array.isArray(v)) return 'must be a list';
  const bad = v.find((x) => typeof x !== 'string' || !spec.enumArray.includes(x));
  return bad === undefined ? null : `contains an unknown value "${String(bad)}"`;
}

export type BackupValidation =
  | { ok: true; backup: BackupV1; counts: Record<BackupTableName, number> }
  | { ok: false; error: string };

/**
 * Validates parsed JSON (or a JSON string) as a v1 backup. Checks the envelope, every row's fields
 * and enums, duplicate primary keys and dangling parent references. Unknown extra fields are dropped.
 */
export function validateBackup(input: unknown): BackupValidation {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, error: 'The file is not valid JSON.' };
    }
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'The file is not a Baki backup.' };
  const d = data as Record<string, unknown>;
  if (d.app !== BACKUP_APP) return { ok: false, error: 'The file is not a Baki backup.' };
  if (d.formatVersion !== BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error:
        typeof d.formatVersion === 'number' && d.formatVersion > BACKUP_FORMAT_VERSION
          ? 'This backup was made by a newer version of Baki. Update the app and try again.'
          : 'Unsupported backup format version.',
    };
  }
  if (typeof d.exportedAt !== 'number') return { ok: false, error: 'Backup is missing its export date.' };
  if (typeof d.tables !== 'object' || d.tables === null) return { ok: false, error: 'Backup has no tables.' };
  const rawTables = d.tables as Record<string, unknown>;

  const tables = {} as Record<BackupTableName, Record<string, unknown>[]>;
  const counts = {} as Record<BackupTableName, number>;
  for (const name of BACKUP_TABLE_NAMES) {
    const rows = rawTables[name] ?? [];
    if (!Array.isArray(rows)) return { ok: false, error: `Table "${name}" must be a list.` };
    const spec = SPECS[name];
    const pk = name === 'settings' ? 'key' : 'id';
    const seen = new Set<string>();
    const clean: Record<string, unknown>[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as unknown;
      if (typeof row !== 'object' || row === null) return { ok: false, error: `${name}[${i}] is not an object.` };
      const r = row as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [field, fs] of Object.entries(spec)) {
        const err = checkField(fs, r[field]);
        if (err) return { ok: false, error: `${name}[${i}].${field} ${err}.` };
        out[field] = r[field] === undefined ? null : r[field];
      }
      const id = out[pk] as string;
      if (seen.has(id)) return { ok: false, error: `${name} has a duplicate id "${id}".` };
      seen.add(id);
      clean.push(out);
    }
    tables[name] = clean;
    counts[name] = clean.length;
  }

  // Referential integrity for the parts the app relies on.
  const ids = (n: BackupTableName) => new Set(tables[n].map((r) => r.id as string));
  const refs: [BackupTableName, string, BackupTableName][] = [
    ['routine_exercises', 'routineId', 'routines'],
    ['routine_exercises', 'exerciseId', 'exercises'],
    ['routine_sets', 'routineExerciseId', 'routine_exercises'],
    ['workout_exercises', 'workoutId', 'workouts'],
    ['workout_exercises', 'exerciseId', 'exercises'],
    ['workout_sets', 'workoutExerciseId', 'workout_exercises'],
  ];
  for (const [child, field, parent] of refs) {
    const parentIds = ids(parent);
    const bad = tables[child].find((r) => !parentIds.has(r[field] as string));
    if (bad) return { ok: false, error: `${child} row "${String(bad.id)}" points to a missing ${parent} row.` };
  }

  return {
    ok: true,
    counts,
    backup: {
      app: BACKUP_APP,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: d.exportedAt,
      tables: tables as unknown as BackupTables,
    },
  };
}
