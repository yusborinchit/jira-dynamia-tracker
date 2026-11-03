import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/index.css';
import { onUnauthorized } from '@/lib/api';
import { sessionQuery } from '@/lib/auth';
import { createAppRouter } from '@/routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

const router = createAppRouter(queryClient);

onUnauthorized(() => {
  queryClient.setQueryData(sessionQuery.queryKey, { authenticated: false });
  if (router.state.location.pathname !== '/login') {
    void router.navigate({ to: '/login', search: { redirect: router.state.location.href } });
  }
});

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
