import type { FastifyInstance } from 'fastify';

import { subscribe, subscriberCount, type TrackerEvent } from '@/services/events';

const HEARTBEAT_MS = 25_000;
const RETRY_MS = 3_000;

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.get('/events', (request, reply) => {
    reply.hijack();

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    reply.raw.write(`retry: ${RETRY_MS}\n\n`);

    const send = (event: TrackerEvent): void => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = subscribe(send);
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), HEARTBEAT_MS);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      request.log.info({ subscribers: subscriberCount() }, 'sse client disconnected');
    });

    request.log.info({ subscribers: subscriberCount() }, 'sse client connected');
  });
}
