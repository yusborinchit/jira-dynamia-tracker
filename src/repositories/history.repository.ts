import { and, asc, eq, gt, isNull, lt, sql } from 'drizzle-orm';

import { db, type DbClient } from '@/db/db';
import { statusHistory, type StatusHistoryRow } from '@/db/schema';
import type { Range } from '@/utils/time';

export function findOpenSegment(issueKey: string, client: DbClient = db): StatusHistoryRow | undefined {
  return client
    .select()
    .from(statusHistory)
    .where(and(eq(statusHistory.issueKey, issueKey), isNull(statusHistory.leftAt)))
    .orderBy(asc(statusHistory.enteredAt))
    .get();
}

export function closeSegment(
  id: number,
  leftAt: Date,
  durationSeconds: number,
  client: DbClient = db,
): void {
  client.update(statusHistory).set({ leftAt, durationSeconds }).where(eq(statusHistory.id, id)).run();
}

export interface OpenSegmentInput {
  issueKey: string;
  statusId: string | null;
  statusName: string;
  category: string | null;
  enteredAt: Date;
}

export function openSegment(input: OpenSegmentInput, client: DbClient = db): void {
  client
    .insert(statusHistory)
    .values({ ...input, leftAt: null, durationSeconds: null })
    .run();
}

export function findSegmentsOverlapping(
  range: Range,
  now: number,
  client: DbClient = db,
): StatusHistoryRow[] {
  return client
    .select()
    .from(statusHistory)
    .where(
      and(
        lt(statusHistory.enteredAt, new Date(range.to)),
        gt(sql`coalesce(${statusHistory.leftAt}, ${now})`, range.from),
      ),
    )
    .orderBy(asc(statusHistory.issueKey), asc(statusHistory.enteredAt))
    .all();
}
