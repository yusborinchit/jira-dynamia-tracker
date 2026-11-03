import { createHash } from 'node:crypto';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

import { type DbClient, db } from '@/db/db';
import { type WebhookEventRow, webhookEvents } from '@/db/schema';

const RETAINED_EVENTS = 2_000;

export type WebhookOutcomeKind =
  | 'applied'
  | 'duplicate'
  | 'ignored'
  | 'unauthorized'
  | 'invalid'
  | 'error';

export interface RecordWebhookEventInput {
  event: string | null;
  issueKey: string | null;
  outcome: WebhookOutcomeKind;
  reason: string | null;
  detail: string | null;
  body: string | null;
  occurredAt: Date | null;
}

function fingerprintOf(input: RecordWebhookEventInput): string {
  const source =
    input.body ??
    `${input.outcome}:${input.reason ?? ''}:${input.event ?? ''}:${input.issueKey ?? ''}`;
  return createHash('sha256').update(source).digest('hex');
}

export function recordWebhookEvent(input: RecordWebhookEventInput, client: DbClient = db): void {
  const receivedAt = new Date();
  const inserted = client
    .insert(webhookEvents)
    .values({
      fingerprint: fingerprintOf(input),
      issueKey: input.issueKey,
      event: input.event ?? 'unknown',
      outcome: input.outcome,
      reason: input.reason,
      detail: input.detail,
      body: input.body,
      occurredAt: input.occurredAt,
      receivedAt,
    })
    .onConflictDoUpdate({
      target: webhookEvents.fingerprint,
      set: {
        duplicateCount: sql`${webhookEvents.duplicateCount} + 1`,
        receivedAt,
        outcome: sql`case when ${webhookEvents.outcome} = 'error' then excluded.outcome else ${webhookEvents.outcome} end`,
        reason: sql`case when ${webhookEvents.outcome} = 'error' then excluded.reason else ${webhookEvents.reason} end`,
        detail: sql`case when ${webhookEvents.outcome} = 'error' then excluded.detail else ${webhookEvents.detail} end`,
      },
    })
    .returning({ id: webhookEvents.id })
    .get();

  if (inserted && inserted.id % 100 === 0) {
    client
      .delete(webhookEvents)
      .where(lt(webhookEvents.id, inserted.id - RETAINED_EVENTS))
      .run();
  }
}

export interface WebhookEventQuery {
  outcome?: string;
  issueKey?: string;
  before?: number;
  limit: number;
}

export type WebhookEventSummary = Omit<WebhookEventRow, 'body' | 'fingerprint'>;

export function listWebhookEvents(
  query: WebhookEventQuery,
  client: DbClient = db,
): WebhookEventSummary[] {
  const conditions = [
    query.outcome ? eq(webhookEvents.outcome, query.outcome) : undefined,
    query.issueKey ? eq(webhookEvents.issueKey, query.issueKey) : undefined,
    query.before ? lt(webhookEvents.id, query.before) : undefined,
  ].filter((condition) => condition !== undefined);

  return client
    .select({
      id: webhookEvents.id,
      issueKey: webhookEvents.issueKey,
      event: webhookEvents.event,
      outcome: webhookEvents.outcome,
      duplicateCount: webhookEvents.duplicateCount,
      reason: webhookEvents.reason,
      detail: webhookEvents.detail,
      occurredAt: webhookEvents.occurredAt,
      receivedAt: webhookEvents.receivedAt,
    })
    .from(webhookEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(webhookEvents.id))
    .limit(query.limit)
    .all();
}

export function findWebhookEvent(id: number, client: DbClient = db): WebhookEventRow | undefined {
  return client.select().from(webhookEvents).where(eq(webhookEvents.id, id)).get();
}

export function countWebhookOutcomesSince(
  since: Date,
  client: DbClient = db,
): Record<string, number> {
  const rows = client
    .select({ outcome: webhookEvents.outcome, count: sql<number>`count(*)` })
    .from(webhookEvents)
    .where(sql`${webhookEvents.receivedAt} >= ${since.getTime()}`)
    .groupBy(webhookEvents.outcome)
    .all();
  return Object.fromEntries(rows.map((row) => [row.outcome, row.count]));
}
