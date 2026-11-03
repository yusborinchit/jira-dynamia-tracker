import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

const WEB_DIST = resolve(process.cwd(), 'web/dist');

const API_PREFIXES = ['/api/', '/reports', '/issues', '/events', '/webhooks'];

export async function webRoutes(app: FastifyInstance): Promise<void> {
  if (!existsSync(WEB_DIST)) {
    app.log.warn({ path: WEB_DIST }, 'web build not found, skipping static routes');
    return;
  }

  await app.register(fastifyStatic, {
    root: WEB_DIST,
    setHeaders: (response, path) => {
      response.header(
        'cache-control',
        path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.method !== 'GET' || API_PREFIXES.some((prefix) => request.url.startsWith(prefix))) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.header('cache-control', 'no-cache').sendFile('index.html');
  });
}
