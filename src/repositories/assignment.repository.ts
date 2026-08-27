import { and, asc, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';

import { type DbClient, db } from '@/db/db';
import { type AssigneeHistoryRow, assigneeHistory } from '@/db/schema';
import type { Range } from '@/utils/time';

export function findOpenAssignment(
  issueKey: string,
  client: DbClient = db,
): AssigneeHistoryRow | undefined {
  return client
    .select()
    .from(assigneeHistory)
    .where(and(eq(assigneeHistory.issueKey, issueKey), isNull(assigneeHistory.leftAt)))
    .orderBy(asc(assigneeHistory.enteredAt))
    .get();
}

export function closeAssignment(
  id: number,
  leftAt: Date,
  durationSeconds: number,
  client: DbClient = db,
): void {
  client
    .update(assigneeHistory)
    .set({ leftAt, durationSeconds })
    .where(eq(assigneeHistory.id, id))
    .run();
}

export interface OpenAssignmentInput {
  issueKey: string;
  accountId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  enteredAt: Date;
}

export function openAssignment(input: OpenAssignmentInput, client: DbClient = db): void {
  client
    .insert(assigneeHistory)
    .values({ ...input, leftAt: null, durationSeconds: null })
    .run();
}

export function findAssignmentsOverlapping(
  range: Range,
  now: number,
  client: DbClient = db,
): AssigneeHistoryRow[] {
  return client
    .select()
    .from(assigneeHistory)
    .where(
      and(
        lt(assigneeHistory.enteredAt, new Date(range.to)),
        gt(sql`coalesce(${assigneeHistory.leftAt}, ${now})`, range.from),
      ),
    )
    .orderBy(asc(assigneeHistory.issueKey), asc(assigneeHistory.enteredAt))
    .all();
}

export function listKnownAssignees(client: DbClient = db): AssigneeHistoryRow[] {
  return client
    .select()
    .from(assigneeHistory)
    .where(sql`${assigneeHistory.accountId} is not null`)
    .orderBy(desc(assigneeHistory.enteredAt))
    .all();
}
