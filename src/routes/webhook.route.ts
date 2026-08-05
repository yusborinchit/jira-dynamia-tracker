import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { env } from '@/env';
import { applyStatusTransition } from '@/services/issue.service';
import { extractStatusTransition } from '@/services/webhook.service';
import { jiraWebhookSchema } from '@/types/jira';

const SECRET_HEADER = 'x-webhook-secret';
const MAX_LOGGED_BODY = 20_000;

function serializeBody(body: unknown): string {
  try {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    if (raw == null) return String(body);
    return raw.length > MAX_LOGGED_BODY ? `${raw.slice(0, MAX_LOGGED_BODY)}… [truncado]` : raw;
  } catch {
    return '[no serializable]';
  }
}

function hasValidSecret(request: FastifyRequest): boolean {
  const provided = request.headers[SECRET_HEADER];
  if (typeof provided !== 'string') return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(env.JIRA_WEBHOOK_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/jira', async (request, reply) => {
    const secretOk = hasValidSecret(request);

    if (env.LOG_WEBHOOK_BODY) {
      request.log.info(
        {
          event: (request.body as { webhookEvent?: unknown } | null)?.webhookEvent ?? null,
          contentType: request.headers['content-type'] ?? null,
          secretHeaderPresent: request.headers[SECRET_HEADER] !== undefined,
          secretOk,
          bodyBytes: request.headers['content-length'] ?? null,
          body: serializeBody(request.body),
        },
        'webhook recibido',
      );
    }

    if (!secretOk) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = jiraWebhookSchema.safeParse(request.body);
    if (!parsed.success) {
      request.log.warn({ issues: parsed.error.issues }, 'payload de Jira inválido');
      return reply.code(400).send({ error: 'invalid_payload' });
    }

    const transition = extractStatusTransition(parsed.data);
    if (!transition) {
      request.log.info(
        {
          issue: parsed.data.issue?.key ?? null,
          event: parsed.data.webhookEvent ?? null,
          changedFields: parsed.data.changelog?.items?.map((item) => item.field ?? item.fieldId) ?? [],
        },
        'evento sin cambio de estado, ignorado',
      );
      return reply.send({ ignored: true });
    }

    try {
      const result = applyStatusTransition(transition);
      request.log.info(
        {
          issue: transition.issueKey,
          from: transition.fromStatusName,
          to: transition.toStatusName,
          applied: result.applied,
        },
        'transición procesada',
      );
      return reply.send(
        result.applied ? { ok: true, issue: transition.issueKey } : { ok: true, duplicate: true },
      );
    } catch (error) {
      request.log.error({ err: error, issue: transition.issueKey }, 'error aplicando la transición');
      return reply.send({ ok: false });
    }
  });
}
