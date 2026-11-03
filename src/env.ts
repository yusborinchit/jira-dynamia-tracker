import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_PATH: z.string().default('./data/jira-tracker.sqlite'),
    JIRA_WEBHOOK_SECRET: z.string().min(16),
    JIRA_BASE_URL: z.url().optional(),
    VITE_JIRA_BASE_URL: z.url().optional(),
    JIRA_EMAIL: z.string().optional(),
    JIRA_API_TOKEN: z.string().optional(),
    LOG_WEBHOOK_BODY: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
