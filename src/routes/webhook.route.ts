import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { env } from '@/env';
import {
  type RecordWebhookEventInput,
  recordWebhookEvent,
} from '@/repositories/webhook-event.repository';
import { publish } from '@/services/events';
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

function eventNameOf(body: unknown): string | null {
  const value = (body as { webhookEvent?: unknown } | null)?.webhookEvent;
  return typeof value === 'string' ? value : null;
}

function occurredAtOf(body: unknown): Date | null {
  const value = (body as { timestamp?: unknown } | null)?.timestamp;
  return typeof value === 'number' ? new Date(value) : null;
}

function issueKeyOf(body: unknown): string | null {
  const value = (body as { issue?: { key?: unknown } } | null)?.issue?.key;
  return typeof value === 'string' ? value : null;
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/jira', async (request, reply) => {
    const secretOk = hasValidSecret(request);
    const record = (
      input: Pick<RecordWebhookEventInput, 'outcome'> & Partial<RecordWebhookEventInput>,
    ): void => {
      try {
        recordWebhookEvent({
          event: eventNameOf(request.body),
          issueKey: issueKeyOf(request.body),
          occurredAt: occurredAtOf(request.body),
          reason: null,
          detail: null,
          body: input.outcome === 'unauthorized' ? null : serializeBody(request.body),
          ...input,
        });
      } catch (error) {
        request.log.warn({ err: error }, 'could not record webhook event');
      }
    };

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
      record({
        outcome: 'unauthorized',
        reason: request.headers[SECRET_HEADER] === undefined ? 'missing_secret' : 'wrong_secret',
      });
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = jiraWebhookSchema.safeParse(request.body);
    if (!parsed.success) {
      request.log.warn({ issues: parsed.error.issues }, 'invalid jira payload');
      record({
        outcome: 'invalid',
        reason: 'invalid_payload',
        detail: parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')
          .slice(0, 1_000),
      });
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
      record({
        outcome: 'ignored',
        reason: outcome.reason,
        detail:
          parsed.data.changelog?.items
            ?.map((item) => item.field ?? item.fieldId)
            .filter(Boolean)
            .join(', ') || null,
      });
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
      record({
        outcome: applied ? 'applied' : 'duplicate',
        issueKey,
        detail:
          [
            transition ? `${transition.fromStatusName ?? '?'} → ${transition.toStatusName}` : null,
            assignment ? `asignado: ${assignment.displayName ?? 'nadie'}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || null,
      });

      if (applied && issueKey) {
        publish({
          type: 'issue.changed',
          issueKey,
          statusName: transition?.toStatusName ?? null,
          assignee: assignment ? (assignment.displayName ?? 'unassigned') : null,
          occurredAt: (
            transition?.occurredAt ??
            assignment?.occurredAt ??
            new Date()
          ).toISOString(),
        });
      }

      return reply.send(applied ? { ok: true, issue: issueKey } : { ok: true, duplicate: true });
    } catch (error) {
      request.log.error({ err: error, issue: issueKey }, 'failed to apply event');
      record({
        outcome: 'error',
        issueKey,
        reason: 'apply_failed',
        detail: error instanceof Error ? error.message.slice(0, 1_000) : String(error),
      });
      return reply.send({ ok: false });
    }
  });
}
