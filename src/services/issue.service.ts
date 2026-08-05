import { db } from '@/db/db';
import {
  closeSegment,
  findOpenSegment,
  openSegment,
} from '@/repositories/history.repository';
import { upsertIssue } from '@/repositories/issue.repository';
import { loadCategoryResolver, upsertStatus } from '@/repositories/status.repository';
import type { StatusTransition } from '@/types/jira';

export type TransitionResult =
  | { applied: true; closedSegmentId: number | null }
  | { applied: false; reason: 'duplicate' };

export function applyStatusTransition(transition: StatusTransition): TransitionResult {
  return db.transaction((tx): TransitionResult => {
    const open = findOpenSegment(transition.issueKey, tx);

    const alreadyThere = open
      ? transition.toStatusId
        ? open.statusId === transition.toStatusId
        : open.statusName === transition.toStatusName
      : false;
    if (alreadyThere) return { applied: false, reason: 'duplicate' };

    upsertIssue(
      {
        jiraIssueId: transition.jiraIssueId,
        issueKey: transition.issueKey,
        projectKey: transition.projectKey,
        summary: transition.summary,
        currentStatusId: transition.toStatusId,
        currentStatusName: transition.toStatusName,
        updatedAt: transition.occurredAt,
      },
      tx,
    );

    if (transition.toStatusId) {
      upsertStatus(
        {
          statusId: transition.toStatusId,
          projectKey: transition.projectKey,
          statusName: transition.toStatusName,
          firstSeenAt: transition.occurredAt,
        },
        tx,
      );
    }

    let closedSegmentId: number | null = null;

    let enteredAt = transition.occurredAt;
    if (open) {
      const leftAt = new Date(Math.max(transition.occurredAt.getTime(), open.enteredAt.getTime()));
      const durationSeconds = Math.round((leftAt.getTime() - open.enteredAt.getTime()) / 1000);
      closeSegment(open.id, leftAt, durationSeconds, tx);
      closedSegmentId = open.id;
      enteredAt = leftAt;
    }

    const resolver = loadCategoryResolver(tx);
    openSegment(
      {
        issueKey: transition.issueKey,
        statusId: transition.toStatusId,
        statusName: transition.toStatusName,
        category: resolver.resolve(transition.toStatusId, transition.toStatusName),
        enteredAt,
      },
      tx,
    );

    return { applied: true, closedSegmentId };
  });
}
