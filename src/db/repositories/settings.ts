import { eq } from 'drizzle-orm';

import type { DistanceUnit, WeightUnit } from '@/domain/types';

import { db, type DbOrTx } from '../client';
import { now } from '../ids';
import { settings } from '../schema';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  /** Default rest timer for exercises without their own rest time. 0 = off. */
  defaultRestSeconds: number;
  theme: ThemePreference;
  /** Keep the screen awake during an active workout. */
  keepAwake: boolean;
  /** Barbell weight used by the plate calculator. */
  barWeightKg: number;
  /** Plates available (per side), in kg, for the plate calculator. */
  availablePlatesKg: number[];
  /** Version of the bundled exercise library last applied to this database. */
  exerciseSeedVersion: number;
}

export const DEFAULT_SETTINGS: Settings = {
  weightUnit: 'kg',
  distanceUnit: 'km',
  defaultRestSeconds: 90,
  theme: 'system',
  keepAwake: true,
  barWeightKg: 20,
  availablePlatesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  exerciseSeedVersion: 0,
};

export type SettingKey = keyof Settings;

/** Merges raw key/value rows over the defaults, ignoring unknown or malformed rows. */
export function parseSettingsRows(rows: { key: string; value: string }[]): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!(row.key in DEFAULT_SETTINGS)) continue;
    try {
      (out as unknown as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      // keep default
    }
  }
  return out;
}

export async function getSettings(tx: DbOrTx = db): Promise<Settings> {
  const rows = await tx.select().from(settings);
  return parseSettingsRows(rows);
}

export async function getSetting<K extends SettingKey>(key: K, tx: DbOrTx = db): Promise<Settings[K]> {
  const row = await tx.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return DEFAULT_SETTINGS[key];
  try {
    return JSON.parse(row.value) as Settings[K];
  } catch {
    return DEFAULT_SETTINGS[key];
  }
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: Settings[K],
  tx: DbOrTx = db,
): Promise<void> {
  const json = JSON.stringify(value);
  const at = now();
  await tx
    .insert(settings)
    .values({ key, value: json, updatedAt: at })
    .onConflictDoUpdate({ target: settings.key, set: { value: json, updatedAt: at } });
}
