import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db } from '@/db/db';
import { issues, statuses, statusHistory, statusMapping } from '@/db/schema';
import { findCategory } from '@/repositories/config.repository';
import { listStatusMappings, normalizeStatusName } from '@/repositories/status.repository';
import { configChanged, parseOrReply, sendError } from '@/routes/admin/shared';

interface StatusEntry {
  status_id: string | null;
  status_name: string;
  projects: string[];
  category: string | null;
  mapped_by: 'id' | 'name' | null;
  segments: number;
  current_issues: number;
}

const mappingSchema = z.object({
  scope: z.enum(['name', 'id']),
  status_id: z.string().min(1).nullish(),
  status_name: z.string().trim().min(1).max(200),
  category: z.string().min(1).nullable(),
});

function entryKey(statusId: string | null, statusName: string): string {
  return statusId ?? `name:${normalizeStatusName(statusName)}`;
}

function listStatusEntries(): StatusEntry[] {
  const mappings = listStatusMappings();
  const byId = new Map(
    mappings.filter((row) => row.jiraStatusId).map((row) => [row.jiraStatusId!, row.category]),
  );
  const byName = new Map(
    mappings
      .filter((row) => row.jiraStatusName)
      .map((row) => [normalizeStatusName(row.jiraStatusName), row.category]),
  );

  const entries = new Map<string, StatusEntry>();
  const ensure = (statusId: string | null, statusName: string): StatusEntry => {
    const key = entryKey(statusId, statusName);
    let entry = entries.get(key);
    if (!entry) {
      const idCategory = statusId ? byId.get(statusId) : undefined;
      const nameCategory = byName.get(normalizeStatusName(statusName));
      entry = {
        status_id: statusId,
        status_name: statusName,
        projects: [],
        category: idCategory ?? nameCategory ?? null,
        mapped_by: idCategory ? 'id' : nameCategory ? 'name' : null,
        segments: 0,
        current_issues: 0,
      };
      entries.set(key, entry);
    }
    return entry;
  };

  for (const row of db.select().from(statuses).all()) {
    const entry = ensure(row.statusId, row.statusName);
    if (!entry.projects.includes(row.projectKey)) entry.projects.push(row.projectKey);
  }

  for (const row of db
    .select({
      statusId: statusHistory.statusId,
      statusName: statusHistory.statusName,
      segments: sql<number>`count(*)`,
    })
    .from(statusHistory)
    .groupBy(statusHistory.statusId, statusHistory.statusName)
    .all()) {
    ensure(row.statusId, row.statusName).segments += row.segments;
  }

  for (const row of db
    .select({
      statusId: issues.currentStatusId,
      statusName: issues.currentStatusName,
      count: sql<number>`count(*)`,
    })
    .from(issues)
    .groupBy(issues.currentStatusId, issues.currentStatusName)
    .all()) {
    if (!row.statusName) continue;
    ensure(row.statusId, row.statusName).current_issues += row.count;
  }

  return [...entries.values()].sort(
    (a, b) =>
      Number(a.category !== null) - Number(b.category !== null) ||
      a.status_name.localeCompare(b.status_name, 'es'),
  );
}

export async function adminStatusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/statuses', async (_request, reply) => {
    return reply.send({
      statuses: listStatusEntries(),
      mappings: listStatusMappings().map((row) => ({
        id: row.id,
        status_id: row.jiraStatusId,
        status_name: row.jiraStatusName,
        category: row.category,
      })),
    });
  });

  app.put('/api/admin/status-mapping', async (request, reply) => {
    const parsed = parseOrReply(mappingSchema, request.body, reply);
    if (!parsed.ok) return reply;
    const { scope, status_id: statusId, status_name: statusName, category } = parsed.data;

    if (scope === 'id' && !statusId) {
      return sendError(reply, 400, 'missing_status_id', 'Este estado no tiene id de Jira.');
    }
    if (category !== null && !findCategory(category)) {
      return sendError(reply, 400, 'unknown_category', 'La categoría no existe.');
    }

    const existing = listStatusMappings().find((row) =>
      scope === 'id'
        ? row.jiraStatusId === statusId
        : !row.jiraStatusId &&
          normalizeStatusName(row.jiraStatusName) === normalizeStatusName(statusName),
    );

    db.transaction((tx) => {
      if (category === null) {
        if (existing) tx.delete(statusMapping).where(eq(statusMapping.id, existing.id)).run();
        return;
      }
      if (existing) {
        tx.update(statusMapping).set({ category }).where(eq(statusMapping.id, existing.id)).run();
        return;
      }
      tx.insert(statusMapping)
        .values(
          scope === 'id'
            ? { jiraStatusId: statusId!, jiraStatusName: null, category }
            : { jiraStatusId: null, jiraStatusName: statusName, category },
        )
        .run();
    });

    configChanged('statuses');
    return reply.send({ ok: true });
  });

  app.get('/api/admin/statuses/unmapped-count', async (_request, reply) => {
    const unmapped = listStatusEntries().filter((entry) => entry.category === null).length;
    return reply.send({ unmapped });
  });
}
