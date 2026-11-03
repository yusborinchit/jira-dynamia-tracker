import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';

import { AppShell } from '@/components/layout/AppShell';
import { TooltipProvider } from '@/components/Tooltip';
import { Toaster } from '@/components/ui/sonner';
import { sessionQuery } from '@/lib/auth';
import { LoginPage } from '@/pages/LoginPage';
import { BoardPage } from '@/pages/reports/BoardPage';
import { ContinuityPage } from '@/pages/reports/ContinuityPage';
import { ReportsLayout } from '@/pages/reports/ReportsLayout';
import { TimelinePage } from '@/pages/reports/TimelinePage';

export const reportSearchSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  span: z.enum(['day', 'month']).optional(),
  projects: z.array(z.string()).optional(),
  excludedProjects: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  excludedCategories: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  excludedAssignees: z.array(z.string()).optional(),
  search: z.string().optional(),
  view: z.enum(['issues', 'continuity', 'board']).optional(),
  focus: z.string().optional(),
  order: z.enum(['default', 'current_status']).optional(),
});

export type ReportSearch = z.infer<typeof reportSearchSchema>;

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <TooltipProvider>
      <div className="theme-shell min-h-screen bg-background text-foreground">
        <Outlet />
      </div>
      <Toaster />
    </TooltipProvider>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (session.authenticated) throw redirect({ href: search.redirect ?? '/' });
  },
  component: LoginPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session.authenticated) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AppShell,
});

const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  id: '_reports',
  validateSearch: reportSearchSchema,
  component: ReportsLayout,
});

const LEGACY_VIEW_PATHS = { continuity: '/continuity', board: '/board' } as const;

const timelineRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/',
  beforeLoad: ({ search }) => {
    if (search.view === 'continuity' || search.view === 'board') {
      throw redirect({
        to: LEGACY_VIEW_PATHS[search.view],
        search: { ...search, view: undefined },
      });
    }
  },
  component: TimelinePage,
});

const continuityRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/continuity',
  component: ContinuityPage,
});

const boardRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/board',
  component: BoardPage,
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  beforeLoad: () => {
    throw redirect({ to: '/settings/statuses' });
  },
});

const statusesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/statuses',
  component: lazyRouteComponent(() => import('@/pages/settings/StatusesPage'), 'StatusesPage'),
});

const categoriesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/categories',
  component: lazyRouteComponent(() => import('@/pages/settings/CategoriesPage'), 'CategoriesPage'),
});

const scheduleRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/schedule',
  component: lazyRouteComponent(() => import('@/pages/settings/SchedulePage'), 'SchedulePage'),
});

const peopleRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/people',
  component: lazyRouteComponent(() => import('@/pages/settings/PeoplePage'), 'PeoplePage'),
});

const importRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/import',
  component: lazyRouteComponent(() => import('@/pages/settings/ImportPage'), 'ImportPage'),
});

const systemRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/system',
  component: lazyRouteComponent(() => import('@/pages/settings/SystemPage'), 'SystemPage'),
});

const historyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/history',
  validateSearch: z.object({ q: z.string().optional() }),
  component: lazyRouteComponent(() => import('@/pages/settings/HistoryPage'), 'HistoryPage'),
});

const historyDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/history/$issueKey',
  component: lazyRouteComponent(
    () => import('@/pages/settings/HistoryDetailPage'),
    'HistoryDetailPage',
  ),
});

const webhooksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/webhooks',
  validateSearch: z.object({
    outcome: z.string().optional(),
    issue: z.string().optional(),
  }),
  component: lazyRouteComponent(() => import('@/pages/settings/WebhooksPage'), 'WebhooksPage'),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    reportsRoute.addChildren([timelineRoute, continuityRoute, boardRoute]),
    settingsIndexRoute,
    statusesRoute,
    categoriesRoute,
    scheduleRoute,
    peopleRoute,
    historyRoute,
    historyDetailRoute,
    importRoute,
    webhooksRoute,
    systemRoute,
  ]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
