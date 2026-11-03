import { queryOptions } from '@tanstack/react-query';

import { ApiError, api } from '@/lib/api';

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

export function transitionsQuery(issueKey: string) {
  return queryOptions({
    queryKey: ['transitions', issueKey] as const,
    queryFn: async ({ signal }): Promise<IssueTransitions> => {
      try {
        return await api<IssueTransitions>(`/issues/${encodeURIComponent(issueKey)}/transitions`, {
          signal,
        });
      } catch (error) {
        throw friendly(error);
      }
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
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
