/**
 * Real SQLite transactions for bulk work (PR rebuilds, imports, restores).
 *
 * drizzle's expo-sqlite driver is synchronous: `db.transaction(async (tx) => { await ... })` commits
 * before the awaited statements run, so it is not atomic. These helpers issue BEGIN/COMMIT on the
 * connection directly; all statements inside must use drizzle's sync methods (`.run()`, `.all()`,
 * `.get()`) on `db`.
 */
import { sqlite } from '../client';

/** Runs `fn` atomically. If a transaction is already open, joins it instead of nesting. */
export function inSyncTransaction<T>(fn: () => T): T {
  if (sqlite.isInTransactionSync()) return fn();
  sqlite.execSync('BEGIN IMMEDIATE');
  try {
    const result = fn();
    sqlite.execSync('COMMIT');
    return result;
  } catch (e) {
    sqlite.execSync('ROLLBACK');
    throw e;
  }
}

/** Lets the UI thread breathe (render progress) while a long transaction is open. */
export const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * One atomic transaction that can yield to the event loop between chunks (via `yieldToUi`) so
 * progress can render. Statements inside must be synchronous drizzle calls.
 */
export async function inChunkedTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (sqlite.isInTransactionSync()) {
    throw new Error('Another transaction is already in progress. Please try again.');
  }
  sqlite.execSync('BEGIN IMMEDIATE');
  try {
    const result = await work();
    sqlite.execSync('COMMIT');
    return result;
  } catch (e) {
    if (sqlite.isInTransactionSync()) sqlite.execSync('ROLLBACK');
    throw e;
  }
}

/** Splits an array into chunks (SQLite limits bound variables per statement). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
