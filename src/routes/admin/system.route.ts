import { desc, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db, sqlite } from '@/db/db';
import { assigneeHistory, issues, statusHistory, webhookEvents } from '@/db/schema';
import { env } from '@/env';
import {
  countWebhookOutcomesSince,
  findWebhookEvent,
  listWebhookEvents,
} from '@/repositories/webhook-event.repository';
import { parseOrReply, sendError } from '@/routes/admin/shared';
import { isJiraConfigured } from '@/services/jira-client';
import { REPORT_TIMEZONE } from '@/utils/time';

const webhookQuerySchema = z.object({
  outcome: z.string().max(20).optional(),
  issue: z.string().max(40).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

function countOf(table: typeof issues | typeof statusHistory | typeof assigneeHistory): number {
  return db.select({ count: sql<number>`count(*)` }).from(table).get()?.count ?? 0;
}

export async function adminSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/system', async (_request, reply) => {
    const pageCount = Number(sqlite.pragma('page_count', { simple: true }));
    const pageSize = Number(sqlite.pragma('page_size', { simple: true }));
    const lastEvent = db
      .select({ receivedAt: webhookEvents.receivedAt, outcome: webhookEvents.outcome })
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.id))
      .limit(1)
      .get();

    return reply.send({
      timezone: REPORT_TIMEZONE,
      database: {
        path: env.DATABASE_PATH,
        bytes: pageCount * pageSize,
        issues: countOf(issues),
        status_segments: countOf(statusHistory),
        assignee_segments: countOf(assigneeHistory),
      },
      jira: {
        configured: isJiraConfigured(),
        base_url: env.JIRA_BASE_URL ?? env.VITE_JIRA_BASE_URL ?? null,
      },
      webhooks: {
        last_received_at: lastEvent?.receivedAt.toISOString() ?? null,
        last_outcome: lastEvent?.outcome ?? null,
        last_24h: countWebhookOutcomesSince(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      },
    });
  });

  app.get('/api/admin/backup', async (_request, reply) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return reply
      .header('content-type', 'application/vnd.sqlite3')
      .header('content-disposition', `attachment; filename="jira-tracker-${stamp}.sqlite"`)
      .send(sqlite.serialize());
  });

  app.get('/api/admin/webhooks', async (request, reply) => {
    const parsed = parseOrReply(webhookQuerySchema, request.query, reply);
    if (!parsed.ok) return reply;
    const events = listWebhookEvents({
      outcome: parsed.data.outcome || undefined,
      issueKey: parsed.data.issue || undefined,
      before: parsed.data.before,
      limit: parsed.data.limit,
    });
    return reply.send({
      events: events.map((event) => ({
        id: event.id,
        received_at: event.receivedAt.toISOString(),
        event: event.event,
        issue_key: event.issueKey,
        outcome: event.outcome,
        reason: event.reason,
        detail: event.detail,
        retries: event.duplicateCount,
      })),
    });
  });

  app.get<{ Params: { id: string } }>('/api/admin/webhooks/:id', async (request, reply) => {
    const event = findWebhookEvent(Number(request.params.id));
    if (!event) return sendError(reply, 404, 'event_not_found', 'El evento no existe.');
    return reply.send({
      id: event.id,
      received_at: event.receivedAt.toISOString(),
      event: event.event,
      issue_key: event.issueKey,
      outcome: event.outcome,
      reason: event.reason,
      detail: event.detail,
      retries: event.duplicateCount,
      body: event.body,
    });
  });
}
