import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export type LiveStatus = 'connecting' | 'live' | 'offline';

export function useLiveReports(): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    const source = new EventSource('/events');

    source.onopen = () => setStatus('live');
    source.onerror = () => setStatus('offline');
    source.addEventListener('issue.changed', () => {
      void queryClient.invalidateQueries({ queryKey: ['report'] });
    });

    return () => source.close();
  }, [queryClient]);

  return status;
}
