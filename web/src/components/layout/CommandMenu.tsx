import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  ActivityIcon,
  CalendarClockIcon,
  ChartGanttIcon,
  CloudDownloadIcon,
  DatabaseIcon,
  FilterIcon,
  HistoryIcon,
  KanbanIcon,
  PaletteIcon,
  TagsIcon,
  UsersIcon,
  WebhookIcon,
} from 'lucide-react';
import { useMemo } from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { adminIssuesQuery } from '@/lib/admin';
import type { MonthlyReport } from '@/lib/report';

const PAGES = [
  { to: '/', label: 'Línea de tiempo', icon: ChartGanttIcon },
  { to: '/continuity', label: 'Continuidad', icon: ActivityIcon },
  { to: '/board', label: 'Tablero', icon: KanbanIcon },
  { to: '/settings/statuses', label: 'Estados', icon: TagsIcon },
  { to: '/settings/categories', label: 'Categorías', icon: PaletteIcon },
  { to: '/settings/schedule', label: 'Horario y feriados', icon: CalendarClockIcon },
  { to: '/settings/people', label: 'Personas', icon: UsersIcon },
  { to: '/settings/history', label: 'Corregir historial', icon: HistoryIcon },
  { to: '/settings/import', label: 'Importar de Jira', icon: CloudDownloadIcon },
  { to: '/settings/webhooks', label: 'Webhooks', icon: WebhookIcon },
  { to: '/settings/system', label: 'Sistema y respaldo', icon: DatabaseIcon },
] as const;

interface IssueOption {
  key: string;
  summary: string;
}

export function CommandMenu({
  open,
  onOpenChange,
  onFilterIssue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilterIssue: (issueKey: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const recent = useQuery({ ...adminIssuesQuery(''), enabled: open });

  const issues = useMemo<IssueOption[]>(() => {
    if (!open) return [];
    const byKey = new Map<string, IssueOption>();
    for (const [, report] of queryClient.getQueriesData<MonthlyReport>({ queryKey: ['report'] })) {
      for (const issue of report?.issues ?? []) {
        byKey.set(issue.issue_key, { key: issue.issue_key, summary: issue.summary ?? '' });
      }
    }
    for (const issue of recent.data?.issues ?? []) {
      if (!byKey.has(issue.issue_key)) {
        byKey.set(issue.issue_key, { key: issue.issue_key, summary: issue.summary ?? '' });
      }
    }
    return [...byKey.values()].sort((a, b) =>
      a.key.localeCompare(b.key, undefined, { numeric: true }),
    );
  }, [open, queryClient, recent.data]);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Ir a una página o buscar un issue…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        <CommandGroup heading="Páginas">
          {PAGES.map((page) => (
            <CommandItem
              key={page.to}
              value={`página ${page.label}`}
              onSelect={() => run(() => void navigate({ to: page.to }))}
            >
              <page.icon />
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {issues.length > 0 && (
          <CommandGroup heading="Filtrar por issue">
            {issues.map((issue) => (
              <CommandItem
                key={`filter-${issue.key}`}
                value={`filtrar ${issue.key}`}
                keywords={[issue.summary]}
                onSelect={() => run(() => onFilterIssue(issue.key))}
              >
                <FilterIcon />
                <span className="font-mono text-xs font-semibold">{issue.key}</span>
                <span className="truncate text-muted-foreground">{issue.summary}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {issues.length > 0 && (
          <CommandGroup heading="Corregir historial">
            {issues.map((issue) => (
              <CommandItem
                key={`history-${issue.key}`}
                value={`historial ${issue.key}`}
                keywords={[issue.summary]}
                onSelect={() =>
                  run(
                    () =>
                      void navigate({
                        to: '/settings/history/$issueKey',
                        params: { issueKey: issue.key },
                      }),
                  )
                }
              >
                <HistoryIcon />
                <span className="font-mono text-xs font-semibold">{issue.key}</span>
                <span className="truncate text-muted-foreground">{issue.summary}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
