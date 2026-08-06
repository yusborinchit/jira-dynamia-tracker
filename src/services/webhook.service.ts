import type { JiraWebhookPayload, StatusTransition } from '@/types/jira';

const STATUS_FIELDS = new Set(['status']);

export function extractStatusTransition(payload: JiraWebhookPayload): StatusTransition | null {
  const issue = payload.issue;
  if (!issue?.key) return null;

  const item = payload.changelog?.items?.find(
    (candidate) =>
      STATUS_FIELDS.has((candidate.fieldId ?? '').toLowerCase()) ||
      STATUS_FIELDS.has((candidate.field ?? '').toLowerCase()),
  );
  if (!item) return null;

  const toStatusName = item.toString ?? issue.fields?.status?.name ?? null;
  if (!toStatusName) return null;

  return {
    jiraIssueId: String(issue.id ?? ''),
    issueKey: issue.key,
    projectKey: issue.fields?.project?.key ?? projectKeyFromIssueKey(issue.key),
    summary: issue.fields?.summary ?? null,
    fromStatusId: item.from ?? null,
    fromStatusName: item.fromString ?? null,
    toStatusId:
      item.to ?? (issue.fields?.status?.id != null ? String(issue.fields.status.id) : null),
    toStatusName,
    occurredAt: new Date(payload.timestamp ?? Date.now()),
  };
}

function projectKeyFromIssueKey(issueKey: string): string {
  const [prefix] = issueKey.split('-');
  return prefix ?? issueKey;
}
