import 'dotenv/config';
import Fastify from 'fastify';

import { sqlite } from '@/db/db';
import { env } from '@/env';
import { healthRoutes } from '@/routes/health.route';
import { reportRoutes } from '@/routes/report.route';
import { webhookRoutes } from '@/routes/webhook.route';

export function buildServer() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    bodyLimit: 5 * 1024 * 1024,
  });

  app.register(healthRoutes);
  app.register(webhookRoutes);
  app.register(reportRoutes);

  return app;
}

async function main(): Promise<void> {
  const app = buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'cerrando');
    await app.close();
    sqlite.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
