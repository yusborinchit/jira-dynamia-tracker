import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const timestampMs = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const issues = sqliteTable(
  'issues',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jiraIssueId: text('jira_issue_id').notNull(),
    issueKey: text('issue_key').notNull().unique(),
    projectKey: text('project_key').notNull(),
    summary: text('summary'),
    currentStatusId: text('current_status_id'),
    currentStatusName: text('current_status_name'),
    currentAssigneeId: text('current_assignee_id'),
    currentAssigneeName: text('current_assignee_name'),
    currentAssigneeAvatar: text('current_assignee_avatar'),
    updatedAt: timestampMs('updated_at').notNull(),
  },
  (t) => [index('issues_project_key_idx').on(t.projectKey)],
);

export const statusHistory = sqliteTable(
  'status_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    issueKey: text('issue_key').notNull(),
    statusId: text('status_id'),
    statusName: text('status_name').notNull(),
    category: text('category'),
    enteredAt: timestampMs('entered_at').notNull(),
    leftAt: timestampMs('left_at'),
    durationSeconds: integer('duration_seconds'),
  },
  (t) => [
    index('status_history_issue_key_idx').on(t.issueKey),
    index('status_history_entered_at_idx').on(t.enteredAt),
    index('status_history_open_idx').on(t.issueKey, t.leftAt),
  ],
);

export const assigneeHistory = sqliteTable(
  'assignee_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    issueKey: text('issue_key').notNull(),
    accountId: text('account_id'),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    enteredAt: timestampMs('entered_at').notNull(),
    leftAt: timestampMs('left_at'),
    durationSeconds: integer('duration_seconds'),
  },
  (t) => [
    index('assignee_history_issue_key_idx').on(t.issueKey),
    index('assignee_history_entered_at_idx').on(t.enteredAt),
    index('assignee_history_open_idx').on(t.issueKey, t.leftAt),
  ],
);

export const statuses = sqliteTable(
  'statuses',
  {
    statusId: text('status_id').notNull(),
    projectKey: text('project_key').notNull(),
    statusName: text('status_name').notNull(),
    firstSeenAt: timestampMs('first_seen_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.statusId, t.projectKey] })],
);

export const statusMapping = sqliteTable(
  'status_mapping',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jiraStatusId: text('jira_status_id'),
    jiraStatusName: text('jira_status_name'),
    category: text('category').notNull(),
  },
  (t) => [
    uniqueIndex('status_mapping_status_id_idx').on(t.jiraStatusId),
    uniqueIndex('status_mapping_status_name_idx').on(sql`lower(trim(${t.jiraStatusName}))`),
  ],
);

export type Issue = typeof issues.$inferSelect;
export type StatusHistoryRow = typeof statusHistory.$inferSelect;
export type AssigneeHistoryRow = typeof assigneeHistory.$inferSelect;
export type StatusMappingRow = typeof statusMapping.$inferSelect;

export const categorySettings = sqliteTable('category_settings', {
  category: text('category').primaryKey(),
  label: text('label').notNull(),
  color: text('color').notNull(),
  role: text('role').notNull(),
  alertAfterSeconds: integer('alert_after_seconds'),
  position: integer('position').notNull(),
});

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey(),
  timezone: text('timezone').notNull(),
  workDays: text('work_days').notNull(),
  workShifts: text('work_shifts').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const holidays = sqliteTable('holidays', {
  date: text('date').primaryKey(),
  label: text('label').notNull(),
});

export const people = sqliteTable('people', {
  accountId: text('account_id').primaryKey(),
  alias: text('alias'),
  hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
});

export const webhookEvents = sqliteTable(
  'webhook_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fingerprint: text('fingerprint').notNull().unique(),
    issueKey: text('issue_key'),
    event: text('event').notNull(),
    outcome: text('outcome').notNull(),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    reason: text('reason'),
    detail: text('detail'),
    body: text('body'),
    occurredAt: timestampMs('occurred_at'),
    receivedAt: timestampMs('received_at').notNull(),
  },
  (t) => [index('webhook_events_received_at_idx').on(t.receivedAt)],
);

export type CategoryRow = typeof categorySettings.$inferSelect;
export type AppSettingsRow = typeof appSettings.$inferSelect;
export type HolidayRow = typeof holidays.$inferSelect;
export type PersonRow = typeof people.$inferSelect;
export type WebhookEventRow = typeof webhookEvents.$inferSelect;
