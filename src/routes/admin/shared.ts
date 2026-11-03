import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

import { invalidateConfig } from '@/services/config.service';
import { publish } from '@/services/events';

export type Parsed<T> = { ok: true; data: T } | { ok: false };

export function parseOrReply<T extends z.ZodType>(
  schema: T,
  value: unknown,
  reply: FastifyReply,
): Parsed<z.infer<T>> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data };
  void reply.code(400).send({
    error: 'invalid_request',
    message: parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; '),
  });
  return { ok: false };
}

export function sendError(
  reply: FastifyReply,
  status: number,
  error: string,
  message: string,
): FastifyReply {
  return reply.code(status).send({ error, message });
}

export function configChanged(section: string): void {
  invalidateConfig();
  publish({ type: 'config.changed', section });
}

export function issueChanged(issueKey: string): void {
  publish({
    type: 'issue.changed',
    issueKey,
    statusName: null,
    assignee: null,
    occurredAt: new Date().toISOString(),
  });
}
