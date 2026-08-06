import type { ChangelogItem, JiraWebhookPayload, StatusTransition } from '@/types/jira';

const STATUS_FIELDS = new Set(['status']);

export type IgnoreReason =
  | 'missing_issue'
  | 'missing_status'
  | 'no_status_change'
  | 'unsupported_event';

export type WebhookOutcome =
  | { kind: 'transition'; event: string; transition: StatusTransition }
  | { kind: 'ignored'; event: string; reason: IgnoreReason };

type EventHandler = (payload: JiraWebhookPayload, event: string) => WebhookOutcome;

function normalizeEvent(webhookEvent: string | undefined): string {
  return (webhookEvent ?? 'unknown').toLowerCase().replace(/^jira:/, '');
}

function findStatusChange(payload: JiraWebhookPayload): ChangelogItem | undefined {
  return payload.changelog?.items?.find(
    (candidate) =>
      STATUS_FIELDS.has((candidate.fieldId ?? '').toLowerCase()) ||
      STATUS_FIELDS.has((candidate.field ?? '').toLowerCase()),
  );
}

function projectKeyFromIssueKey(issueKey: string): string {
  const [prefix] = issueKey.split('-');
  return prefix ?? issueKey;
}

function buildTransition(
  payload: JiraWebhookPayload,
  toStatusName: string,
  item?: ChangelogItem,
): StatusTransition {
  const issue = payload.issue;
  const issueKey = issue?.key ?? '';
  const currentStatus = issue?.fields?.status;

  return {
    jiraIssueId: String(issue?.id ?? ''),
    issueKey,
    projectKey: issue?.fields?.project?.key ?? projectKeyFromIssueKey(issueKey),
    summary: issue?.fields?.summary ?? null,
    fromStatusId: item?.from ?? null,
    fromStatusName: item?.fromString ?? null,
    toStatusId: item?.to ?? (currentStatus?.id != null ? String(currentStatus.id) : null),
    toStatusName,
    occurredAt: new Date(payload.timestamp ?? Date.now()),
  };
}

const fromCurrentStatus: EventHandler = (payload, event) => {
  const toStatusName = payload.issue?.fields?.status?.name;
  if (!toStatusName) return { kind: 'ignored', event, reason: 'missing_status' };

  return { kind: 'transition', event, transition: buildTransition(payload, toStatusName) };
};

const fromChangelog: EventHandler = (payload, event) => {
  const item = findStatusChange(payload);
  if (!item) return { kind: 'ignored', event, reason: 'no_status_change' };

  const toStatusName = item.toString ?? payload.issue?.fields?.status?.name;
  if (!toStatusName) return { kind: 'ignored', event, reason: 'missing_status' };

  return { kind: 'transition', event, transition: buildTransition(payload, toStatusName, item) };
};

const ignore =
  (reason: IgnoreReason): EventHandler =>
  (_payload, event) => ({ kind: 'ignored', event, reason });

const handlers: Record<string, EventHandler> = {
  issue_created: fromCurrentStatus,
  issue_updated: fromChangelog,
  issue_deleted: ignore('unsupported_event'),
};

export function interpretWebhook(payload: JiraWebhookPayload): WebhookOutcome {
  const event = normalizeEvent(payload.webhookEvent);
  if (!payload.issue?.key) return { kind: 'ignored', event, reason: 'missing_issue' };

  const handler = handlers[event] ?? fromChangelog;
  return handler(payload, event);
}
