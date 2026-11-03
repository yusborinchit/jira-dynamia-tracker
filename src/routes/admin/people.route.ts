import { desc, isNotNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db } from '@/db/db';
import { assigneeHistory, issues } from '@/db/schema';
import { listPeople, upsertPerson } from '@/repositories/config.repository';
import { configChanged, parseOrReply } from '@/routes/admin/shared';

export interface KnownPerson {
  account_id: string;
  jira_name: string;
  avatar_url: string | null;
  alias: string | null;
  hidden: boolean;
  current_issues: number;
  last_seen_at: string | null;
}

const personSchema = z.object({
  alias: z.string().trim().max(80).nullable(),
  hidden: z.boolean(),
});

export function listKnownPeople(): KnownPerson[] {
  const byId = new Map<string, KnownPerson>();
  const ensure = (accountId: string, name: string | null, avatar: string | null) => {
    let person = byId.get(accountId);
    if (!person) {
      person = {
        account_id: accountId,
        jira_name: name ?? accountId,
        avatar_url: avatar,
        alias: null,
        hidden: false,
        current_issues: 0,
        last_seen_at: null,
      };
      byId.set(accountId, person);
    }
    if (!person.avatar_url && avatar) person.avatar_url = avatar;
    return person;
  };

  for (const row of db
    .select()
    .from(assigneeHistory)
    .where(isNotNull(assigneeHistory.accountId))
    .orderBy(desc(assigneeHistory.enteredAt))
    .all()) {
    const person = ensure(row.accountId!, row.displayName, row.avatarUrl);
    person.last_seen_at ??= (row.leftAt ?? row.enteredAt).toISOString();
    if (row.leftAt === null) person.last_seen_at = new Date().toISOString();
  }

  for (const row of db.select().from(issues).where(isNotNull(issues.currentAssigneeId)).all()) {
    const person = ensure(
      row.currentAssigneeId!,
      row.currentAssigneeName,
      row.currentAssigneeAvatar,
    );
    if (row.currentAssigneeName) person.jira_name = row.currentAssigneeName;
    person.current_issues += 1;
  }

  for (const override of listPeople()) {
    const person = byId.get(override.accountId);
    if (!person) continue;
    person.alias = override.alias;
    person.hidden = override.hidden;
  }

  return [...byId.values()].sort((a, b) =>
    (a.alias ?? a.jira_name).localeCompare(b.alias ?? b.jira_name, 'es'),
  );
}

export async function adminPeopleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/people', async (_request, reply) => {
    return reply.send({ people: listKnownPeople() });
  });

  app.put<{ Params: { accountId: string } }>(
    '/api/admin/people/:accountId',
    async (request, reply) => {
      const parsed = parseOrReply(personSchema, request.body, reply);
      if (!parsed.ok) return reply;
      upsertPerson({
        accountId: request.params.accountId,
        alias: parsed.data.alias || null,
        hidden: parsed.data.hidden,
      });
      configChanged('people');
      return reply.send({ ok: true });
    },
  );
}
