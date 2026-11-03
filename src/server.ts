import 'dotenv/config';
import fastifyCompress from '@fastify/compress';
import Fastify from 'fastify';

import { sqlite } from '@/db/db';
import { env } from '@/env';
import { adminCategoryRoutes } from '@/routes/admin/categories.route';
import { adminHistoryRoutes } from '@/routes/admin/history.route';
import { adminImportRoutes } from '@/routes/admin/import.route';
import { adminPeopleRoutes } from '@/routes/admin/people.route';
import { adminScheduleRoutes } from '@/routes/admin/schedule.route';
import { adminStatusRoutes } from '@/routes/admin/statuses.route';
import { adminSystemRoutes } from '@/routes/admin/system.route';
import { authRoutes, installAuthGuard } from '@/routes/auth.route';
import { eventRoutes } from '@/routes/events.route';
import { healthRoutes } from '@/routes/health.route';
import { reportRoutes } from '@/routes/report.route';
import { transitionRoutes } from '@/routes/transition.route';
import { webRoutes } from '@/routes/web.route';
import { webhookRoutes } from '@/routes/webhook.route';

export function buildServer() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    bodyLimit: 5 * 1024 * 1024,
    trustProxy: true,
  });

  app.register(fastifyCompress, { global: true, threshold: 1024 });
  installAuthGuard(app);

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(webhookRoutes);
  app.register(reportRoutes);
  app.register(eventRoutes);
  app.register(transitionRoutes);
  app.register(adminStatusRoutes);
  app.register(adminCategoryRoutes);
  app.register(adminScheduleRoutes);
  app.register(adminPeopleRoutes);
  app.register(adminHistoryRoutes);
  app.register(adminImportRoutes);
  app.register(adminSystemRoutes);
  app.register(webRoutes);

  return app;
}

async function main(): Promise<void> {
  const app = buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
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
