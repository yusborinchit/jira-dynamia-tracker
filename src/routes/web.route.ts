import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

const WEB_DIST = resolve(process.cwd(), 'web/dist');

export async function webRoutes(app: FastifyInstance): Promise<void> {
  if (!existsSync(WEB_DIST)) {
    app.log.warn({ path: WEB_DIST }, 'web build not found, skipping static routes');
    return;
  }

  await app.register(fastifyStatic, { root: WEB_DIST });

  app.setNotFoundHandler((request, reply) => {
    if (request.method !== 'GET' || request.url.startsWith('/reports')) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.sendFile('index.html');
  });
}
