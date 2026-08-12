import type {
  AssignmentChange,
  ChangelogItem,
  JiraWebhookPayload,
  StatusTransition,
} from '@/types/jira';

export type IgnoreReason =
  | 'missing_issue'
  | 'missing_status'
  | 'no_tracked_change'
  | 'unsupported_event';

export type WebhookOutcome =
  | {
      kind: 'changes';
      event: string;
      transition: StatusTransition | null;
      assignment: AssignmentChange | null;
    }
  | { kind: 'ignored'; event: string; reason: IgnoreReason };

type EventHandler = (payload: JiraWebhookPayload, event: string) => WebhookOutcome;

function normalizeEvent(webhookEvent: string | undefined): string {
  return (webhookEvent ?? 'unknown').toLowerCase().replace(/^jira:/, '');
}

function findChange(payload: JiraWebhookPayload, field: string): ChangelogItem | undefined {
  return payload.changelog?.items?.find(
    (candidate) =>
      (candidate.fieldId ?? '').toLowerCase() === field ||
      (candidate.field ?? '').toLowerCase() === field,
  );
}

function projectKeyFromIssueKey(issueKey: string): string {
  const [prefix] = issueKey.split('-');
  return prefix ?? issueKey;
}

function occurredAtOf(payload: JiraWebhookPayload): Date {
  return new Date(payload.timestamp ?? Date.now());
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
    occurredAt: occurredAtOf(payload),
  };
}

const AVATAR_SIZES = ['48x48', '32x32', '24x24', '16x16'];

function pickAvatar(urls: Record<string, string> | undefined): string | null {
  if (!urls) return null;
  for (const size of AVATAR_SIZES) {
    if (urls[size]) return urls[size];
  }
  return Object.values(urls)[0] ?? null;
}

function buildAssignment(payload: JiraWebhookPayload, item?: ChangelogItem): AssignmentChange {
  const assignee = payload.issue?.fields?.assignee;
  const accountId = item ? (item.to ?? null) : (assignee?.accountId ?? null);

  // `fields.assignee` already reflects the update, so it only describes this change
  // when it is the same person the changelog points at.
  const current = accountId && assignee?.accountId === accountId ? assignee : undefined;

  return {
    issueKey: payload.issue?.key ?? '',
    accountId,
    displayName: item
      ? (item.toString ?? current?.displayName ?? null)
      : (current?.displayName ?? null),
    avatarUrl: pickAvatar(current?.avatarUrls),
    occurredAt: occurredAtOf(payload),
  };
}

// Issues assigned before assignment tracking existed have no changelog entry to
// replay, so any event that carries an assignee is a chance to seed the history.
function assignmentFromCurrentFields(payload: JiraWebhookPayload): AssignmentChange | null {
  if (!payload.issue?.fields?.assignee?.accountId) return null;
  return buildAssignment(payload);
}

const fromCurrentFields: EventHandler = (payload, event) => {
  const toStatusName = payload.issue?.fields?.status?.name;
  if (!toStatusName) return { kind: 'ignored', event, reason: 'missing_status' };

  return {
    kind: 'changes',
    event,
    transition: buildTransition(payload, toStatusName),
    assignment: buildAssignment(payload),
  };
};

const fromChangelog: EventHandler = (payload, event) => {
  const statusItem = findChange(payload, 'status');
  const assigneeItem = findChange(payload, 'assignee');
  if (!statusItem && !assigneeItem) return { kind: 'ignored', event, reason: 'no_tracked_change' };

  const toStatusName = statusItem
    ? (statusItem.toString ?? payload.issue?.fields?.status?.name)
    : undefined;
  if (statusItem && !toStatusName) return { kind: 'ignored', event, reason: 'missing_status' };

  return {
    kind: 'changes',
    event,
    transition: toStatusName ? buildTransition(payload, toStatusName, statusItem) : null,
    assignment: assigneeItem
      ? buildAssignment(payload, assigneeItem)
      : assignmentFromCurrentFields(payload),
  };
};

const ignore =
  (reason: IgnoreReason): EventHandler =>
  (_payload, event) => ({ kind: 'ignored', event, reason });

const handlers: Record<string, EventHandler> = {
  issue_created: fromCurrentFields,
  issue_updated: fromChangelog,
  issue_deleted: ignore('unsupported_event'),
};

export function interpretWebhook(payload: JiraWebhookPayload): WebhookOutcome {
  const event = normalizeEvent(payload.webhookEvent);
  if (!payload.issue?.key) return { kind: 'ignored', event, reason: 'missing_issue' };

  const handler = handlers[event] ?? fromChangelog;
  return handler(payload, event);
}
