import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export type LiveStatus = 'connecting' | 'live' | 'offline';

const INVALIDATE_DELAY_MS = 400;

export function useLiveReports(): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    const source = new EventSource('/events');
    let timer: ReturnType<typeof setTimeout> | null = null;
    let refreshAdmin = false;

    const scheduleRefresh = (admin: boolean) => {
      refreshAdmin ||= admin;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: ['report'] });
        if (refreshAdmin) void queryClient.invalidateQueries({ queryKey: ['admin'] });
        refreshAdmin = false;
      }, INVALIDATE_DELAY_MS);
    };

    source.onopen = () => setStatus('live');
    source.onerror = () => setStatus('offline');
    source.addEventListener('issue.changed', () => scheduleRefresh(false));
    source.addEventListener('config.changed', () => scheduleRefresh(true));

    return () => {
      if (timer) clearTimeout(timer);
      source.close();
    };
  }, [queryClient]);

  return status;
}
