import { asc, eq, inArray } from 'drizzle-orm';

import { type DbClient, db } from '@/db/db';
import { assigneeHistory, issues, statusHistory } from '@/db/schema';
import { getConfig } from '@/services/config.service';

export type SegmentKind = 'status' | 'assignee';

export interface SegmentLabel {
  statusId?: string | null;
  statusName?: string;
  accountId?: string | null;
  displayName?: string | null;
}

export interface SegmentPatch {
  enteredAt?: number;
  leftAt?: number;
  label?: SegmentLabel;
}

export class HistoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface ChainRow {
  id: number;
  enteredAt: number;
  leftAt: number | null;
  labelKey: string;
}

interface ChainPlan {
  updates: Map<number, { enteredAt: number; leftAt: number | null }>;
  deletes: number[];
}

function labelKeyOf(
  kind: SegmentKind,
  row: { statusId?: string | null; statusName?: string; accountId?: string | null },
): string {
  return kind === 'status'
    ? `${row.statusId ?? ''}|${(row.statusName ?? '').trim().toLowerCase()}`
    : (row.accountId ?? '');
}

function loadChain(kind: SegmentKind, issueKey: string, client: DbClient): ChainRow[] {
  const rows =
    kind === 'status'
      ? client
          .select()
          .from(statusHistory)
          .where(eq(statusHistory.issueKey, issueKey))
          .orderBy(asc(statusHistory.enteredAt), asc(statusHistory.id))
          .all()
      : client
          .select()
          .from(assigneeHistory)
          .where(eq(assigneeHistory.issueKey, issueKey))
          .orderBy(asc(assigneeHistory.enteredAt), asc(assigneeHistory.id))
          .all();

  return rows.map((row) => ({
    id: row.id,
    enteredAt: row.enteredAt.getTime(),
    leftAt: row.leftAt ? row.leftAt.getTime() : null,
    labelKey: labelKeyOf(kind, row),
  }));
}

function indexOf(chain: readonly ChainRow[], id: number): number {
  const index = chain.findIndex((row) => row.id === id);
  if (index === -1) throw new HistoryError('segment_not_found', 'El tramo no existe.');
  return index;
}

function emptyPlan(): ChainPlan {
  return { updates: new Map(), deletes: [] };
}

function setBounds(plan: ChainPlan, row: ChainRow, enteredAt: number, leftAt: number | null): void {
  row.enteredAt = enteredAt;
  row.leftAt = leftAt;
  plan.updates.set(row.id, { enteredAt, leftAt });
}

function planBoundaryChange(
  chain: ChainRow[],
  id: number,
  patch: { enteredAt?: number; leftAt?: number },
  now: number,
): ChainPlan {
  const plan = emptyPlan();
  const index = indexOf(chain, id);
  const row = chain[index]!;
  const previous = chain[index - 1];
  const next = chain[index + 1];

  if (patch.leftAt !== undefined && row.leftAt === null) {
    throw new HistoryError(
      'segment_open',
      'El tramo actual sigue abierto: se cierra cuando la tarea cambia en Jira.',
    );
  }

  const enteredAt = patch.enteredAt ?? row.enteredAt;
  const leftAt = patch.leftAt ?? row.leftAt;
  if (enteredAt >= (leftAt ?? now)) {
    throw new HistoryError('invalid_range', 'El inicio tiene que ser anterior al fin.');
  }

  if (previous && patch.enteredAt !== undefined) {
    if (enteredAt <= previous.enteredAt) {
      throw new HistoryError(
        'overlaps_previous',
        'El inicio no puede quedar antes del comienzo del tramo anterior.',
      );
    }
    const contiguous = previous.leftAt === row.enteredAt;
    if (contiguous || (previous.leftAt !== null && previous.leftAt > enteredAt)) {
      setBounds(plan, previous, previous.enteredAt, enteredAt);
    }
  }

  if (next && patch.leftAt !== undefined && leftAt !== null) {
    if (leftAt >= (next.leftAt ?? now)) {
      throw new HistoryError(
        'overlaps_next',
        'El fin no puede quedar después del final del tramo siguiente.',
      );
    }
    const contiguous = next.enteredAt === row.leftAt;
    if (contiguous || next.enteredAt < leftAt) {
      setBounds(plan, next, leftAt, next.leftAt);
    }
  }

  setBounds(plan, row, enteredAt, leftAt);
  return plan;
}

function planDelete(chain: ChainRow[], id: number): ChainPlan {
  const plan = emptyPlan();
  const index = indexOf(chain, id);
  const row = chain[index]!;
  const previous = chain[index - 1];
  const next = chain[index + 1];

  if (!previous && !next) {
    throw new HistoryError(
      'last_segment',
      'Es el único tramo del issue. Para sacarlo del todo, eliminá el issue.',
    );
  }

  plan.deletes.push(row.id);

  if (previous && next && previous.labelKey === next.labelKey) {
    setBounds(plan, previous, previous.enteredAt, next.leftAt);
    plan.deletes.push(next.id);
    return plan;
  }

  if (previous) setBounds(plan, previous, previous.enteredAt, row.leftAt);
  else if (next) setBounds(plan, next, row.enteredAt, next.leftAt);

  return plan;
}

function applyPlan(kind: SegmentKind, plan: ChainPlan, client: DbClient): void {
  const table = kind === 'status' ? statusHistory : assigneeHistory;

  for (const [id, bounds] of plan.updates) {
    if (plan.deletes.includes(id)) continue;
    const durationSeconds =
      bounds.leftAt === null ? null : Math.round((bounds.leftAt - bounds.enteredAt) / 1000);
    client
      .update(table)
      .set({
        enteredAt: new Date(bounds.enteredAt),
        leftAt: bounds.leftAt === null ? null : new Date(bounds.leftAt),
        durationSeconds,
      })
      .where(eq(table.id, id))
      .run();
  }

  if (plan.deletes.length > 0) {
    client.delete(table).where(inArray(table.id, plan.deletes)).run();
  }
}

function applyLabel(kind: SegmentKind, id: number, label: SegmentLabel, client: DbClient): void {
  if (kind === 'status') {
    if (!label.statusName) {
      throw new HistoryError('invalid_label', 'Falta el estado.');
    }
    const statusId = label.statusId ?? null;
    client
      .update(statusHistory)
      .set({
        statusId,
        statusName: label.statusName,
        category: getConfig().resolver.resolve(statusId, label.statusName),
      })
      .where(eq(statusHistory.id, id))
      .run();
    return;
  }

  client
    .update(assigneeHistory)
    .set({
      accountId: label.accountId ?? null,
      displayName: label.accountId ? (label.displayName ?? null) : null,
      avatarUrl: label.accountId
        ? (client
            .select({ avatarUrl: assigneeHistory.avatarUrl })
            .from(assigneeHistory)
            .where(eq(assigneeHistory.accountId, label.accountId))
            .all()
            .find((row) => row.avatarUrl)?.avatarUrl ?? null)
        : null,
    })
    .where(eq(assigneeHistory.id, id))
    .run();
}

function syncCurrent(kind: SegmentKind, issueKey: string, client: DbClient): void {
  if (kind === 'status') {
    const open = client
      .select()
      .from(statusHistory)
      .where(eq(statusHistory.issueKey, issueKey))
      .orderBy(asc(statusHistory.enteredAt))
      .all()
      .at(-1);
    if (!open) return;
    client
      .update(issues)
      .set({ currentStatusId: open.statusId, currentStatusName: open.statusName })
      .where(eq(issues.issueKey, issueKey))
      .run();
    return;
  }

  const open = client
    .select()
    .from(assigneeHistory)
    .where(eq(assigneeHistory.issueKey, issueKey))
    .orderBy(asc(assigneeHistory.enteredAt))
    .all()
    .at(-1);
  if (!open) return;
  client
    .update(issues)
    .set({
      currentAssigneeId: open.accountId,
      currentAssigneeName: open.displayName,
      currentAssigneeAvatar: open.avatarUrl,
    })
    .where(eq(issues.issueKey, issueKey))
    .run();
}

function assertIssue(issueKey: string, client: DbClient): void {
  const found = client.select().from(issues).where(eq(issues.issueKey, issueKey)).get();
  if (!found) throw new HistoryError('issue_not_found', 'El issue no existe.');
}

export function updateSegment(
  kind: SegmentKind,
  issueKey: string,
  id: number,
  patch: SegmentPatch,
  now = Date.now(),
): void {
  db.transaction((tx) => {
    assertIssue(issueKey, tx);
    const chain = loadChain(kind, issueKey, tx);
    if (patch.enteredAt !== undefined || patch.leftAt !== undefined) {
      applyPlan(kind, planBoundaryChange(chain, id, patch, now), tx);
    } else {
      indexOf(chain, id);
    }
    if (patch.label) applyLabel(kind, id, patch.label, tx);
    syncCurrent(kind, issueKey, tx);
  });
}

export function deleteSegment(kind: SegmentKind, issueKey: string, id: number): void {
  db.transaction((tx) => {
    assertIssue(issueKey, tx);
    const chain = loadChain(kind, issueKey, tx);
    applyPlan(kind, planDelete(chain, id), tx);
    syncCurrent(kind, issueKey, tx);
  });
}

export function splitSegment(
  kind: SegmentKind,
  issueKey: string,
  id: number,
  at: number,
  label: SegmentLabel,
  now = Date.now(),
): void {
  db.transaction((tx) => {
    assertIssue(issueKey, tx);
    const chain = loadChain(kind, issueKey, tx);
    const row = chain[indexOf(chain, id)]!;
    if (at <= row.enteredAt || at >= (row.leftAt ?? now)) {
      throw new HistoryError(
        'outside_segment',
        'El momento elegido tiene que caer dentro del tramo.',
      );
    }

    const originalLeftAt = row.leftAt;
    const plan = emptyPlan();
    setBounds(plan, row, row.enteredAt, at);
    applyPlan(kind, plan, tx);

    const bounds = {
      issueKey,
      enteredAt: new Date(at),
      leftAt: originalLeftAt === null ? null : new Date(originalLeftAt),
      durationSeconds: originalLeftAt === null ? null : Math.round((originalLeftAt - at) / 1000),
    };
    const inserted =
      kind === 'status'
        ? tx
            .insert(statusHistory)
            .values({ ...bounds, statusId: null, statusName: '?', category: null })
            .returning({ id: statusHistory.id })
            .get()
        : tx
            .insert(assigneeHistory)
            .values({ ...bounds, accountId: null, displayName: null, avatarUrl: null })
            .returning({ id: assigneeHistory.id })
            .get();

    applyLabel(kind, inserted.id, label, tx);
    syncCurrent(kind, issueKey, tx);
  });
}

export function deleteIssue(issueKey: string): void {
  db.transaction((tx) => {
    assertIssue(issueKey, tx);
    tx.delete(statusHistory).where(eq(statusHistory.issueKey, issueKey)).run();
    tx.delete(assigneeHistory).where(eq(assigneeHistory.issueKey, issueKey)).run();
    tx.delete(issues).where(eq(issues.issueKey, issueKey)).run();
  });
}
