import { type QueryClient, queryOptions } from '@tanstack/react-query';

import { ApiError, api } from '@/lib/api';
import type { MonthlyReport } from '@/lib/report';

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

const ERROR_MESSAGES: Record<string, string> = {
  jira_not_configured: 'Falta configurar JIRA_EMAIL y JIRA_API_TOKEN en el servidor.',
  jira_unauthorized: 'Jira rechazó las credenciales configuradas en el servidor.',
  issue_not_found:
    'Jira no encuentra esta tarea o la cuenta configurada no tiene acceso. Revisá JIRA_EMAIL y JIRA_API_TOKEN.',
  jira_unreachable: 'No se pudo conectar con Jira.',
};

function friendly(error: unknown): Error {
  if (error instanceof ApiError) {
    return new Error(
      ERROR_MESSAGES[error.code] ?? `Jira respondió con un error (${error.status}).`,
    );
  }
  return error instanceof Error ? error : new Error('No se pudo conectar con Jira.');
}

const TRANSITIONS_CACHE_MS = 60 * 60_000;

export interface TransitionContext {
  issueKey: string;
  projectKey: string | null;
  statusId: string | null;
}

export function issueContext(queryClient: QueryClient, issueKey: string): TransitionContext {
  for (const [, report] of queryClient.getQueriesData<MonthlyReport>({ queryKey: ['report'] })) {
    const issue = report?.issues.find((candidate) => candidate.issue_key === issueKey);
    if (issue) {
      return {
        issueKey,
        projectKey: issue.project_key || null,
        statusId: issue.current_status_id,
      };
    }
  }
  return { issueKey, projectKey: null, statusId: null };
}

export function transitionsKey(context: TransitionContext) {
  return context.projectKey && context.statusId
    ? (['transitions', context.projectKey, context.statusId] as const)
    : (['transitions', 'issue', context.issueKey] as const);
}

async function fetchTransitions(
  issueKey: string,
  fresh: boolean,
  signal?: AbortSignal,
): Promise<IssueTransitions> {
  try {
    return await api<IssueTransitions>(
      `/issues/${encodeURIComponent(issueKey)}/transitions${fresh ? '?fresh=1' : ''}`,
      { signal },
    );
  } catch (error) {
    throw friendly(error);
  }
}

export function transitionsQuery(context: TransitionContext) {
  return queryOptions({
    queryKey: transitionsKey(context),
    queryFn: ({ signal }) => fetchTransitions(context.issueKey, false, signal),
    staleTime: TRANSITIONS_CACHE_MS,
    gcTime: TRANSITIONS_CACHE_MS,
    retry: false,
  });
}

export async function refreshTransitions(
  queryClient: QueryClient,
  context: TransitionContext,
): Promise<IssueTransitions> {
  queryClient.removeQueries({ queryKey: transitionsKey(context), exact: true });
  const fresh = await fetchTransitions(context.issueKey, true);
  queryClient.setQueryData(
    transitionsKey({ ...context, statusId: fresh.current_status_id }),
    fresh,
  );
  return fresh;
}

export async function moveIssue(issueKey: string, transitionId: string): Promise<void> {
  try {
    await api(`/issues/${encodeURIComponent(issueKey)}/transitions`, {
      method: 'POST',
      body: { transitionId },
    });
  } catch (error) {
    throw friendly(error);
  }
}
