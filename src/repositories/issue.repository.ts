import { eq, inArray } from 'drizzle-orm';

import { type DbClient, db } from '@/db/db';
import { type Issue, issues } from '@/db/schema';

export interface UpsertIssueInput {
  jiraIssueId: string;
  issueKey: string;
  projectKey: string;
  summary: string | null;
  currentStatusId: string | null;
  currentStatusName: string;
  updatedAt: Date;
}

export function upsertIssue(input: UpsertIssueInput, client: DbClient = db): void {
  client
    .insert(issues)
    .values(input)
    .onConflictDoUpdate({
      target: issues.issueKey,
      set: {
        jiraIssueId: input.jiraIssueId,
        projectKey: input.projectKey,
        summary: input.summary,
        currentStatusId: input.currentStatusId,
        currentStatusName: input.currentStatusName,
        updatedAt: input.updatedAt,
      },
    })
    .run();
}

export function findIssueByKey(issueKey: string, client: DbClient = db): Issue | undefined {
  return client.select().from(issues).where(eq(issues.issueKey, issueKey)).get();
}

export function listIssuesByKeys(issueKeys: string[], client: DbClient = db): Issue[] {
  if (issueKeys.length === 0) return [];
  return client.select().from(issues).where(inArray(issues.issueKey, issueKeys)).all();
}
