import {
  queryOptions,
  type UseMutationOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { api, errorMessage } from '@/lib/api';
import type { CategoryRole } from '@/lib/report';

export interface StatusEntry {
  status_id: string | null;
  status_name: string;
  projects: string[];
  category: string | null;
  mapped_by: 'id' | 'name' | null;
  segments: number;
  current_issues: number;
}

export interface AdminCategory {
  key: string;
  label: string;
  color: string;
  role: CategoryRole;
  alert_after_seconds: number | null;
  order: number;
  mappings: number;
  protected: boolean;
}

export interface WorkShift {
  from: string;
  to: string;
}

export interface ScheduleResponse {
  timezone: string;
  schedule: { days: number[]; shifts: WorkShift[] };
  holidays: { date: string; label: string }[];
}

export interface KnownPerson {
  account_id: string;
  jira_name: string;
  avatar_url: string | null;
  alias: string | null;
  hidden: boolean;
  current_issues: number;
  last_seen_at: string | null;
}

export interface AdminIssueRow {
  issue_key: string;
  project_key: string;
  summary: string | null;
  current_status_name: string | null;
  current_assignee_name: string | null;
  updated_at: string;
  segments: number;
}

export interface StatusSegment {
  id: number;
  status_id: string | null;
  status_name: string;
  category: string | null;
  color: string | null;
  entered_at: string;
  left_at: string | null;
}

export interface AssigneeSegment {
  id: number;
  account_id: string | null;
  display_name: string | null;
  entered_at: string;
  left_at: string | null;
}

export interface IssueHistory {
  issue: {
    issue_key: string;
    project_key: string;
    summary: string | null;
    current_status_name: string | null;
    current_assignee_name: string | null;
    updated_at: string;
  };
  status_segments: StatusSegment[];
  assignee_segments: AssigneeSegment[];
  options: {
    statuses: { status_id: string | null; status_name: string }[];
    people: { account_id: string; display_name: string }[];
  };
}

export interface WebhookEvent {
  id: number;
  received_at: string;
  event: string;
  issue_key: string | null;
  outcome: string;
  reason: string | null;
  detail: string | null;
  retries: number;
  body?: string | null;
}

export interface SystemInfo {
  timezone: string;
  database: {
    path: string;
    bytes: number;
    issues: number;
    status_segments: number;
    assignee_segments: number;
  };
  jira: { configured: boolean; base_url: string | null };
  webhooks: {
    last_received_at: string | null;
    last_outcome: string | null;
    last_24h: Record<string, number>;
  };
}

export interface ImportResult {
  issueKey: string;
  summary: string | null;
  statusSegments: number;
  assigneeSegments: number;
  since: string;
}

export const statusesQuery = queryOptions({
  queryKey: ['admin', 'statuses'] as const,
  queryFn: () => api<{ statuses: StatusEntry[] }>('/api/admin/statuses'),
});

export const unmappedCountQuery = queryOptions({
  queryKey: ['admin', 'statuses', 'unmapped'] as const,
  queryFn: () => api<{ unmapped: number }>('/api/admin/statuses/unmapped-count'),
  staleTime: 60_000,
});

export const categoriesQuery = queryOptions({
  queryKey: ['admin', 'categories'] as const,
  queryFn: () => api<{ categories: AdminCategory[] }>('/api/admin/categories'),
});

export const scheduleQuery = queryOptions({
  queryKey: ['admin', 'schedule'] as const,
  queryFn: () => api<ScheduleResponse>('/api/admin/schedule'),
});

export const peopleQuery = queryOptions({
  queryKey: ['admin', 'people'] as const,
  queryFn: () => api<{ people: KnownPerson[] }>('/api/admin/people'),
});

export function adminIssuesQuery(search: string) {
  return queryOptions({
    queryKey: ['admin', 'issues', search] as const,
    queryFn: ({ signal }) =>
      api<{ issues: AdminIssueRow[] }>(
        `/api/admin/issues?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`,
        { signal },
      ),
  });
}

export function issueHistoryQuery(issueKey: string) {
  return queryOptions({
    queryKey: ['admin', 'issue', issueKey] as const,
    queryFn: () => api<IssueHistory>(`/api/admin/issues/${encodeURIComponent(issueKey)}`),
  });
}

export function webhooksQuery(outcome: string, issue: string) {
  const params = new URLSearchParams({ limit: '200' });
  if (outcome) params.set('outcome', outcome);
  if (issue) params.set('issue', issue);
  return queryOptions({
    queryKey: ['admin', 'webhooks', outcome, issue] as const,
    queryFn: () => api<{ events: WebhookEvent[] }>(`/api/admin/webhooks?${params}`),
    refetchInterval: 15_000,
  });
}

export function webhookQuery(id: number) {
  return queryOptions({
    queryKey: ['admin', 'webhook', id] as const,
    queryFn: () => api<WebhookEvent>(`/api/admin/webhooks/${id}`),
  });
}

export const systemQuery = queryOptions({
  queryKey: ['admin', 'system'] as const,
  queryFn: () => api<SystemInfo>('/api/admin/system'),
  refetchInterval: 30_000,
});

export function useAdminMutation<TVariables, TResult = unknown>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  options: Omit<UseMutationOptions<TResult, Error, TVariables>, 'mutationFn'> & {
    success?: string | ((result: TResult) => string);
  } = {},
) {
  const queryClient = useQueryClient();
  const { success, onSuccess, ...rest } = options;

  return useMutation<TResult, Error, TVariables>({
    mutationFn,
    onSuccess: async (result, variables, context, meta) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin'] }),
        queryClient.invalidateQueries({ queryKey: ['report'] }),
      ]);
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
      await onSuccess?.(result, variables, context, meta);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
    ...rest,
  });
}
