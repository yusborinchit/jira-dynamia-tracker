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
export type StatusMappingRow = typeof statusMapping.$inferSelect;
