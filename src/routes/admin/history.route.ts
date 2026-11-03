import { asc, desc, eq, like, or, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { db } from '@/db/db';
import { assigneeHistory, issues, statusHistory } from '@/db/schema';
import { listKnownPeople } from '@/routes/admin/people.route';
import { issueChanged, parseOrReply, sendError } from '@/routes/admin/shared';
import { getConfig } from '@/services/config.service';
import {
  deleteIssue,
  deleteSegment,
  HistoryError,
  type SegmentKind,
  type SegmentLabel,
  splitSegment,
  updateSegment,
} from '@/services/history.service';

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const paramsSchema = z.object({
  issueKey: z.string().min(1),
  kind: z.enum(['status', 'assignee']),
  id: z.coerce.number().int().positive(),
});

const labelFields = {
  status_id: z.string().min(1).nullish(),
  status_name: z.string().trim().min(1).max(200).optional(),
  account_id: z.string().min(1).nullish(),
};

const patchSchema = z.object({
  entered_at: z.iso.datetime({ offset: true }).optional(),
  left_at: z.iso.datetime({ offset: true }).optional(),
  ...labelFields,
});

const splitSchema = z.object({ at: z.iso.datetime({ offset: true }), ...labelFields });

function labelOf(
  kind: SegmentKind,
  body: z.infer<typeof patchSchema> | z.infer<typeof splitSchema>,
): SegmentLabel | undefined {
  if (kind === 'status') {
    if (!body.status_name) return undefined;
    return { statusId: body.status_id ?? null, statusName: body.status_name };
  }
  if (body.account_id === undefined) return undefined;
  const accountId = body.account_id ?? null;
  const person = accountId
    ? listKnownPeople().find((candidate) => candidate.account_id === accountId)
    : undefined;
  return { accountId, displayName: person?.jira_name ?? null };
}

function handleHistoryError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof HistoryError) {
    return sendError(
      reply,
      error.code.endsWith('not_found') ? 404 : 409,
      error.code,
      error.message,
    );
  }
  throw error;
}

export async function adminHistoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/issues', async (request, reply) => {
    const parsed = parseOrReply(listQuerySchema, request.query, reply);
    if (!parsed.ok) return reply;
    const { search, limit } = parsed.data;
    const pattern = `%${search ?? ''}%`;

    const rows = db
      .select({
        issueKey: issues.issueKey,
        projectKey: issues.projectKey,
        summary: issues.summary,
        currentStatusName: issues.currentStatusName,
        currentAssigneeName: issues.currentAssigneeName,
        updatedAt: issues.updatedAt,
        segments: sql<number>`(select count(*) from ${statusHistory} where ${statusHistory.issueKey} = ${issues.issueKey})`,
      })
      .from(issues)
      .where(search ? or(like(issues.issueKey, pattern), like(issues.summary, pattern)) : undefined)
      .orderBy(desc(issues.updatedAt))
      .limit(limit)
      .all();

    return reply.send({
      issues: rows.map((row) => ({
        issue_key: row.issueKey,
        project_key: row.projectKey,
        summary: row.summary,
        current_status_name: row.currentStatusName,
        current_assignee_name: row.currentAssigneeName,
        updated_at: row.updatedAt.toISOString(),
        segments: row.segments,
      })),
    });
  });

  app.get<{ Params: { issueKey: string } }>(
    '/api/admin/issues/:issueKey',
    async (request, reply) => {
      const { issueKey } = request.params;
      const issue = db.select().from(issues).where(eq(issues.issueKey, issueKey)).get();
      if (!issue) return sendError(reply, 404, 'issue_not_found', 'El issue no existe.');

      const config = getConfig();
      const statusRows = db
        .select()
        .from(statusHistory)
        .where(eq(statusHistory.issueKey, issueKey))
        .orderBy(asc(statusHistory.enteredAt), asc(statusHistory.id))
        .all();
      const assigneeRows = db
        .select()
        .from(assigneeHistory)
        .where(eq(assigneeHistory.issueKey, issueKey))
        .orderBy(asc(assigneeHistory.enteredAt), asc(assigneeHistory.id))
        .all();

      const knownStatuses = db
        .selectDistinct({ statusId: statusHistory.statusId, statusName: statusHistory.statusName })
        .from(statusHistory)
        .orderBy(asc(statusHistory.statusName))
        .all();

      return reply.send({
        issue: {
          issue_key: issue.issueKey,
          project_key: issue.projectKey,
          summary: issue.summary,
          current_status_name: issue.currentStatusName,
          current_assignee_name: issue.currentAssigneeName,
          updated_at: issue.updatedAt.toISOString(),
        },
        status_segments: statusRows.map((row) => {
          const category = config.resolver.resolve(row.statusId, row.statusName);
          return {
            id: row.id,
            status_id: row.statusId,
            status_name: row.statusName,
            category,
            color: category ? (config.categoryByKey.get(category)?.color ?? null) : null,
            entered_at: row.enteredAt.toISOString(),
            left_at: row.leftAt?.toISOString() ?? null,
          };
        }),
        assignee_segments: assigneeRows.map((row) => ({
          id: row.id,
          account_id: row.accountId,
          display_name: row.displayName,
          entered_at: row.enteredAt.toISOString(),
          left_at: row.leftAt?.toISOString() ?? null,
        })),
        options: {
          statuses: knownStatuses.map((row) => ({
            status_id: row.statusId,
            status_name: row.statusName,
          })),
          people: listKnownPeople().map((person) => ({
            account_id: person.account_id,
            display_name: person.alias ?? person.jira_name,
          })),
        },
      });
    },
  );

  app.patch('/api/admin/issues/:issueKey/segments/:kind/:id', async (request, reply) => {
    const params = parseOrReply(paramsSchema, request.params, reply);
    if (!params.ok) return reply;
    const body = parseOrReply(patchSchema, request.body, reply);
    if (!body.ok) return reply;
    const { issueKey, kind, id } = params.data;

    try {
      updateSegment(kind, issueKey, id, {
        enteredAt: body.data.entered_at ? Date.parse(body.data.entered_at) : undefined,
        leftAt: body.data.left_at ? Date.parse(body.data.left_at) : undefined,
        label: labelOf(kind, body.data),
      });
    } catch (error) {
      return handleHistoryError(reply, error);
    }
    issueChanged(issueKey);
    return reply.send({ ok: true });
  });

  app.post('/api/admin/issues/:issueKey/segments/:kind/:id/split', async (request, reply) => {
    const params = parseOrReply(paramsSchema, request.params, reply);
    if (!params.ok) return reply;
    const body = parseOrReply(splitSchema, request.body, reply);
    if (!body.ok) return reply;
    const { issueKey, kind, id } = params.data;
    const label = labelOf(kind, body.data);
    if (!label) return sendError(reply, 400, 'missing_label', 'Elegí qué va en el tramo nuevo.');

    try {
      splitSegment(kind, issueKey, id, Date.parse(body.data.at), label);
    } catch (error) {
      return handleHistoryError(reply, error);
    }
    issueChanged(issueKey);
    return reply.send({ ok: true });
  });

  app.delete('/api/admin/issues/:issueKey/segments/:kind/:id', async (request, reply) => {
    const params = parseOrReply(paramsSchema, request.params, reply);
    if (!params.ok) return reply;
    const { issueKey, kind, id } = params.data;

    try {
      deleteSegment(kind, issueKey, id);
    } catch (error) {
      return handleHistoryError(reply, error);
    }
    issueChanged(issueKey);
    return reply.send({ ok: true });
  });

  app.delete<{ Params: { issueKey: string } }>(
    '/api/admin/issues/:issueKey',
    async (request, reply) => {
      try {
        deleteIssue(request.params.issueKey);
      } catch (error) {
        return handleHistoryError(reply, error);
      }
      issueChanged(request.params.issueKey);
      return reply.send({ ok: true });
    },
  );
}
