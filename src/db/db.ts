import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { env } from '@/env';

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

export const sqlite = new Database(env.DATABASE_PATH);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export type Db = typeof db;

export type DbClient = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
