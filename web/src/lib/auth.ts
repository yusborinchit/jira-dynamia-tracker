import { queryOptions } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface Session {
  authenticated: boolean;
}

export const sessionQuery = queryOptions({
  queryKey: ['session'] as const,
  queryFn: () => api<Session>('/api/auth/session'),
  staleTime: 5 * 60_000,
});

export function login(password: string): Promise<Session> {
  return api<Session>('/api/auth/login', { method: 'POST', body: { password } });
}

export function logout(): Promise<Session> {
  return api<Session>('/api/auth/logout', { method: 'POST', body: {} });
}
