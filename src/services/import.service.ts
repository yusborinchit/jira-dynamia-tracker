import { eq } from 'drizzle-orm';

import { db } from '@/db/db';
import { assigneeHistory, statusHistory } from '@/db/schema';
import { updateIssueAssignee, upsertIssue } from '@/repositories/issue.repository';
import { upsertStatus } from '@/repositories/status.repository';
import { getConfig } from '@/services/config.service';
import {
  fetchChangelog,
  fetchIssueSnapshot,
  type JiraChangelogEntry,
} from '@/services/jira-client';
import { pickAvatar } from '@/services/webhook.service';

export interface ImportResult {
  issueKey: string;
  summary: string | null;
  statusSegments: number;
  assigneeSegments: number;
  since: string;
}

interface Change {
  at: number;
  from: string | null;
  fromName: string | null;
  to: string | null;
  toName: string | null;
}

interface Stretch<T> {
  value: T;
  enteredAt: number;
  leftAt: number | null;
}

function changesOf(entries: readonly JiraChangelogEntry[], field: string): Change[] {
  return entries
    .flatMap((entry) =>
      entry.items
        .filter(
          (item) =>
            (item.fieldId ?? '').toLowerCase() === field ||
            (item.field ?? '').toLowerCase() === field,
        )
        .map((item) => ({
          at: Date.parse(entry.created),
          from: item.from ?? null,
          fromName: item.fromString ?? null,
          to: item.to ?? null,
          toName: item.toString ?? null,
        })),
    )
    .filter((change) => Number.isFinite(change.at))
    .sort((a, b) => a.at - b.at);
}

function buildStretches<T>(
  start: number,
  initial: T,
  changes: readonly Change[],
  toValue: (change: Change) => T,
): Stretch<T>[] {
  const stretches: Stretch<T>[] = [];
  let current: Stretch<T> = { value: initial, enteredAt: start, leftAt: null };

  for (const change of changes) {
    const at = Math.max(change.at, current.enteredAt);
    stretches.push({ ...current, leftAt: at });
    current = { value: toValue(change), enteredAt: at, leftAt: null };
  }
  stretches.push(current);

  return stretches;
}

function durationOf(stretch: Stretch<unknown>): number | null {
  return stretch.leftAt === null ? null : Math.round((stretch.leftAt - stretch.enteredAt) / 1000);
}

export async function importIssueFromJira(issueKey: string): Promise<ImportResult> {
  const [snapshot, changelog] = await Promise.all([
    fetchIssueSnapshot(issueKey),
    fetchChangelog(issueKey),
  ]);

  const { fields } = snapshot;
  const created = Date.parse(fields.created);
  const statusChanges = changesOf(changelog, 'status');
  const assigneeChanges = changesOf(changelog, 'assignee');

  const firstStatus = statusChanges[0];
  const initialStatus = firstStatus
    ? { id: firstStatus.from, name: firstStatus.fromName ?? firstStatus.from ?? '?' }
    : { id: fields.status.id, name: fields.status.name };
  const statuses = buildStretches(created, initialStatus, statusChanges, (change) => ({
    id: change.to,
    name: change.toName ?? change.to ?? '?',
  }));

  const firstAssignee = assigneeChanges[0];
  const initialAssignee = firstAssignee
    ? { accountId: firstAssignee.from, displayName: firstAssignee.fromName }
    : {
        accountId: fields.assignee?.accountId ?? null,
        displayName: fields.assignee?.displayName ?? null,
      };
  const assignees = buildStretches(created, initialAssignee, assigneeChanges, (change) => ({
    accountId: change.to,
    displayName: change.toName,
  }));

  const currentAvatar = pickAvatar(fields.assignee?.avatarUrls);
  const projectKey = fields.project.key;
  const resolver = getConfig().resolver;

  db.transaction((tx) => {
    const avatars = new Map<string, string>();
    for (const row of tx
      .select()
      .from(assigneeHistory)
      .where(eq(assigneeHistory.issueKey, snapshot.key))
      .all()) {
      if (row.accountId && row.avatarUrl) avatars.set(row.accountId, row.avatarUrl);
    }
    if (fields.assignee?.accountId && currentAvatar) {
      avatars.set(fields.assignee.accountId, currentAvatar);
    }

    tx.delete(statusHistory).where(eq(statusHistory.issueKey, snapshot.key)).run();
    tx.delete(assigneeHistory).where(eq(assigneeHistory.issueKey, snapshot.key)).run();

    upsertIssue(
      {
        jiraIssueId: snapshot.id,
        issueKey: snapshot.key,
        projectKey,
        summary: fields.summary ?? null,
        currentStatusId: fields.status.id,
        currentStatusName: fields.status.name,
        updatedAt: new Date(),
      },
      tx,
    );
    updateIssueAssignee(
      {
        issueKey: snapshot.key,
        accountId: fields.assignee?.accountId ?? null,
        displayName: fields.assignee?.displayName ?? null,
        avatarUrl: currentAvatar,
        updatedAt: new Date(),
      },
      tx,
    );

    for (const stretch of statuses) {
      if (stretch.value.id) {
        upsertStatus(
          {
            statusId: stretch.value.id,
            projectKey,
            statusName: stretch.value.name,
            firstSeenAt: new Date(stretch.enteredAt),
          },
          tx,
        );
      }
      tx.insert(statusHistory)
        .values({
          issueKey: snapshot.key,
          statusId: stretch.value.id,
          statusName: stretch.value.name,
          category: resolver.resolve(stretch.value.id, stretch.value.name),
          enteredAt: new Date(stretch.enteredAt),
          leftAt: stretch.leftAt === null ? null : new Date(stretch.leftAt),
          durationSeconds: durationOf(stretch),
        })
        .run();
    }

    for (const stretch of assignees) {
      tx.insert(assigneeHistory)
        .values({
          issueKey: snapshot.key,
          accountId: stretch.value.accountId,
          displayName: stretch.value.displayName,
          avatarUrl: stretch.value.accountId
            ? (avatars.get(stretch.value.accountId) ?? null)
            : null,
          enteredAt: new Date(stretch.enteredAt),
          leftAt: stretch.leftAt === null ? null : new Date(stretch.leftAt),
          durationSeconds: durationOf(stretch),
        })
        .run();
    }
  });

  return {
    issueKey: snapshot.key,
    summary: fields.summary ?? null,
    statusSegments: statuses.length,
    assigneeSegments: assignees.length,
    since: new Date(created).toISOString(),
  };
}
