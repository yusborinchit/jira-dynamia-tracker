import { z } from 'zod';

import { categoryColor, UNCATEGORIZED_COLOR } from '@/db/status-mapping.data';
import { env } from '@/env';
import { loadCategoryResolver } from '@/repositories/status.repository';

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

export async function fetchTransitions(issueKey: string): Promise<IssueTransitions> {
  const key = encodeURIComponent(issueKey);
  const [rawTransitions, rawIssue] = await Promise.all([
    jiraRequest(`/issue/${key}/transitions`),
    jiraRequest(`/issue/${key}?fields=status`),
  ]);

  const { transitions } = transitionsSchema.parse(rawTransitions);
  const current = issueStatusSchema.parse(rawIssue).fields.status ?? null;
  const resolver = loadCategoryResolver();

  return {
    current_status_name: current?.name ?? null,
    transitions: transitions
      .filter((transition) => transition.isAvailable !== false)
      .filter((transition) => transition.to.id !== current?.id)
      .map((transition) => {
        const category = resolver.resolve(transition.to.id, transition.to.name);
        return {
          id: transition.id,
          name: transition.name,
          to_status_id: transition.to.id,
          to_status_name: transition.to.name,
          category,
          color: category ? categoryColor(category) : UNCATEGORIZED_COLOR,
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
