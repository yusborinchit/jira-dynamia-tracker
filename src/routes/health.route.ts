import type { FastifyInstance } from 'fastify';

import { sqlite } from '@/db/db';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    sqlite.prepare('select 1').get();
    return reply.send({ status: 'ok' });
  });
}
