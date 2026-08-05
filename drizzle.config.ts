import 'dotenv/config';
import type { Config } from 'drizzle-kit';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.env.DATABASE_PATH ?? './data/jira-tracker.sqlite';

mkdirSync(dirname(url), { recursive: true });

export default {
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: { url },
  verbose: true,
  strict: false,
} satisfies Config;
