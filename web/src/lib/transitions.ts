import { queryOptions } from '@tanstack/react-query';

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

async function readError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  const code = body?.error ?? '';
  return new Error(ERROR_MESSAGES[code] ?? `Jira respondió con un error (${response.status}).`);
}

export function transitionsQuery(issueKey: string) {
  return queryOptions({
    queryKey: ['transitions', issueKey] as const,
    queryFn: async (): Promise<IssueTransitions> => {
      const response = await fetch(`/issues/${encodeURIComponent(issueKey)}/transitions`);
      if (!response.ok) throw await readError(response);
      return response.json() as Promise<IssueTransitions>;
    },
    staleTime: 0,
    gcTime: 60_000,
    retry: false,
  });
}

export async function moveIssue(issueKey: string, transitionId: string): Promise<void> {
  const response = await fetch(`/issues/${encodeURIComponent(issueKey)}/transitions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transitionId }),
  });
  if (!response.ok) throw await readError(response);
}
