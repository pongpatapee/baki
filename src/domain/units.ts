/**
 * Unit conversion and formatting. Storage is always kg / meters / seconds;
 * conversion happens only at the display/input boundary.
 */
import type { DistanceUnit, WeightUnit } from './types';

export const KG_PER_LB = 0.45359237;
export const METERS_PER_MILE = 1609.344;

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function metersToUnit(m: number, unit: DistanceUnit): number {
  return unit === 'km' ? m / 1000 : m / METERS_PER_MILE;
}

export function unitToMeters(value: number, unit: DistanceUnit): number {
  return unit === 'km' ? value * 1000 : value * METERS_PER_MILE;
}

/** Round to at most `decimals` places and drop trailing zeros: 102.50 -> "102.5". */
export function trimNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '0';
  const factor = 10 ** decimals;
  const rounded = Math.round(n * factor) / factor;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Weight value (no unit suffix) for input fields, e.g. 100 kg in lb -> "220.46". */
export function displayWeight(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg == null) return '';
  return trimNumber(kgToUnit(kg, unit), unit === 'kg' ? 2 : 1);
}

export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg == null) return '-';
  return `${displayWeight(kg, unit)} ${unit}`;
}

/** Large volume totals: 12345 -> "12,345 kg". */
export function formatVolume(kg: number, unit: WeightUnit): string {
  const v = Math.round(kgToUnit(kg, unit));
  return `${v.toLocaleString('en-US')} ${unit}`;
}

export function formatDistance(m: number | null | undefined, unit: DistanceUnit): string {
  if (m == null) return '-';
  return `${trimNumber(metersToUnit(m, unit), 2)} ${unit}`;
}

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null) return '-';
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Workout length: 3725 -> "1h 2m", 540 -> "9m". */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Parses "1:30", "90", "1:02:05" into seconds. Returns null for empty/invalid input. */
export function parseDuration(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const parts = t.split(':').map((p) => p.trim());
  if (parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

/** Parses a decimal number typed by the user; accepts "," as decimal separator. */
export function parseDecimal(input: string): number | null {
  const t = input.trim().replace(',', '.');
  if (!t) return null;
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseInteger(input: string): number | null {
  const t = input.trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}
