import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { env } from '@/env';
import { applyAssignmentChange, applyStatusTransition } from '@/services/issue.service';
import { interpretWebhook } from '@/services/webhook.service';
import { jiraWebhookSchema } from '@/types/jira';

const SECRET_HEADER = 'x-webhook-secret';
const MAX_LOGGED_BODY = 20_000;

function serializeBody(body: unknown): string {
  try {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    if (raw == null) return String(body);
    return raw.length > MAX_LOGGED_BODY ? `${raw.slice(0, MAX_LOGGED_BODY)}… [truncated]` : raw;
  } catch {
    return '[unserializable]';
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
        'webhook received',
      );
    }

    if (!secretOk) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = jiraWebhookSchema.safeParse(request.body);
    if (!parsed.success) {
      request.log.warn({ issues: parsed.error.issues }, 'invalid jira payload');
      return reply.code(400).send({ error: 'invalid_payload' });
    }

    const outcome = interpretWebhook(parsed.data);
    if (outcome.kind === 'ignored') {
      request.log.info(
        {
          issue: parsed.data.issue?.key ?? null,
          event: outcome.event,
          reason: outcome.reason,
          changedFields:
            parsed.data.changelog?.items?.map((item) => item.field ?? item.fieldId) ?? [],
        },
        'event ignored',
      );
      return reply.send({ ignored: true, reason: outcome.reason });
    }

    const { transition, assignment } = outcome;
    const issueKey = transition?.issueKey ?? assignment?.issueKey ?? null;

    try {
      const statusResult = transition ? applyStatusTransition(transition) : null;
      const assignmentResult = assignment ? applyAssignmentChange(assignment) : null;

      request.log.info(
        {
          issue: issueKey,
          event: outcome.event,
          from: transition?.fromStatusName ?? null,
          to: transition?.toStatusName ?? null,
          assignee: assignment ? (assignment.displayName ?? 'unassigned') : null,
          statusApplied: statusResult?.applied ?? false,
          assignmentApplied: assignmentResult?.applied ?? false,
        },
        'event processed',
      );

      const applied = (statusResult?.applied ?? false) || (assignmentResult?.applied ?? false);
      return reply.send(applied ? { ok: true, issue: issueKey } : { ok: true, duplicate: true });
    } catch (error) {
      request.log.error({ err: error, issue: issueKey }, 'failed to apply event');
      return reply.send({ ok: false });
    }
  });
}
