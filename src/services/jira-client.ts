import { z } from 'zod';

import { env } from '@/env';
import { categoryColor, getConfig } from '@/services/config.service';

const REQUEST_TIMEOUT_MS = 10_000;

const transitionsSchema = z.object({
  transitions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      isAvailable: z.boolean().optional(),
      to: z.object({ id: z.string(), name: z.string() }),
    }),
  ),
});

const issueStatusSchema = z.object({
  fields: z.object({
    status: z.object({ id: z.string(), name: z.string() }).nullish(),
  }),
});

export interface IssueTransition {
  id: string;
  name: string;
  to_status_id: string;
  to_status_name: string;
  category: string | null;
  color: string;
}

export interface IssueTransitions {
  current_status_id: string | null;
  current_status_name: string | null;
  transitions: IssueTransition[];
}

export class JiraError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface JiraConfig {
  baseUrl: string;
  authorization: string;
}

export function isJiraConfigured(): boolean {
  return jiraConfig() !== null;
}

function jiraConfig(): JiraConfig | null {
  const baseUrl = env.JIRA_BASE_URL ?? env.VITE_JIRA_BASE_URL;
  if (!baseUrl || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) return null;

  const credentials = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString('base64');
  return { baseUrl: baseUrl.replace(/\/$/, ''), authorization: `Basic ${credentials}` };
}

async function jiraRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const config = jiraConfig();
  if (!config) throw new JiraError(0, 'jira_not_configured');

  const response = await fetch(`${config.baseUrl}/rest/api/3${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: config.authorization,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new JiraError(response.status, detail.slice(0, 500) || response.statusText);
  }

  return response.status === 204 ? null : response.json();
}

export interface KnownStatus {
  id: string;
  name: string;
}

async function fetchCurrentStatus(key: string): Promise<KnownStatus | null> {
  const raw = await jiraRequest(`/issue/${key}?fields=status`);
  return issueStatusSchema.parse(raw).fields.status ?? null;
}

export async function fetchTransitions(
  issueKey: string,
  known: KnownStatus | null = null,
): Promise<IssueTransitions> {
  const key = encodeURIComponent(issueKey);
  const [rawTransitions, current] = await Promise.all([
    jiraRequest(`/issue/${key}/transitions`),
    known ? Promise.resolve(known) : fetchCurrentStatus(key),
  ]);

  const { transitions } = transitionsSchema.parse(rawTransitions);
  const config = getConfig();

  return {
    current_status_id: current?.id ?? null,
    current_status_name: current?.name ?? null,
    transitions: transitions
      .filter((transition) => transition.isAvailable !== false)
      .filter((transition) => transition.to.id !== current?.id)
      .map((transition) => {
        const category = config.resolver.resolve(transition.to.id, transition.to.name);
        return {
          id: transition.id,
          name: transition.name,
          to_status_id: transition.to.id,
          to_status_name: transition.to.name,
          category,
          color: categoryColor(config, category),
        };
      }),
  };
}

export async function transitionIssue(issueKey: string, transitionId: string): Promise<void> {
  await jiraRequest(`/issue/${encodeURIComponent(issueKey)}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: transitionId } }),
  });
}

const userSchema = z
  .object({
    accountId: z.string().optional(),
    displayName: z.string().optional(),
    avatarUrls: z.record(z.string(), z.string()).optional(),
  })
  .nullish();

const issueSnapshotSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    summary: z.string().nullish(),
    created: z.string(),
    project: z.object({ key: z.string() }),
    status: z.object({ id: z.string(), name: z.string() }),
    assignee: userSchema,
  }),
});

const changelogPageSchema = z.object({
  isLast: z.boolean().optional(),
  total: z.number().optional(),
  values: z.array(
    z.object({
      created: z.string(),
      items: z.array(
        z.object({
          field: z.string().optional(),
          fieldId: z.string().optional(),
          from: z.string().nullish(),
          fromString: z.string().nullish(),
          to: z.string().nullish(),
          toString: z.string().nullish(),
        }),
      ),
    }),
  ),
});

const searchPageSchema = z.object({
  issues: z.array(z.object({ key: z.string() })),
  nextPageToken: z.string().nullish(),
  isLast: z.boolean().optional(),
});

export type JiraIssueSnapshot = z.infer<typeof issueSnapshotSchema>;
export type JiraChangelogEntry = z.infer<typeof changelogPageSchema>['values'][number];

const CHANGELOG_PAGE_SIZE = 100;
const MAX_CHANGELOG_PAGES = 50;
const SEARCH_PAGE_SIZE = 100;

export async function fetchIssueSnapshot(issueKey: string): Promise<JiraIssueSnapshot> {
  const key = encodeURIComponent(issueKey);
  return issueSnapshotSchema.parse(
    await jiraRequest(`/issue/${key}?fields=summary,created,project,status,assignee`),
  );
}

export async function fetchChangelog(issueKey: string): Promise<JiraChangelogEntry[]> {
  const key = encodeURIComponent(issueKey);
  const entries: JiraChangelogEntry[] = [];

  for (let page = 0; page < MAX_CHANGELOG_PAGES; page += 1) {
    const startAt = page * CHANGELOG_PAGE_SIZE;
    const result = changelogPageSchema.parse(
      await jiraRequest(
        `/issue/${key}/changelog?startAt=${startAt}&maxResults=${CHANGELOG_PAGE_SIZE}`,
      ),
    );
    entries.push(...result.values);
    const reachedEnd =
      result.isLast ??
      (result.total !== undefined ? startAt + result.values.length >= result.total : true);
    if (reachedEnd || result.values.length === 0) break;
  }

  return entries;
}

export async function searchIssueKeys(jql: string, limit: number): Promise<string[]> {
  const keys: string[] = [];
  let nextPageToken: string | null | undefined;

  while (keys.length < limit) {
    const result = searchPageSchema.parse(
      await jiraRequest('/search/jql', {
        method: 'POST',
        body: JSON.stringify({
          jql,
          fields: ['key'],
          maxResults: Math.min(SEARCH_PAGE_SIZE, limit - keys.length),
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      }),
    );
    keys.push(...result.issues.map((issue) => issue.key));
    nextPageToken = result.nextPageToken;
    if (result.isLast || !nextPageToken || result.issues.length === 0) break;
  }

  return keys.slice(0, limit);
}
