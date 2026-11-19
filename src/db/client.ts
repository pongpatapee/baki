import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'baki.db';

/** Raw expo-sqlite handle. Change listener is required for drizzle's useLiveQuery. */
export const sqlite = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
sqlite.execSync('PRAGMA journal_mode = WAL;');

export const db = drizzle(sqlite, { schema });

export type Db = typeof db;
/** Either the db or a transaction handle; repositories accept both so they compose. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
