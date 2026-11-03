import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { SearchIcon } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';

import { PageHeader, SettingsPage } from '@/components/layout/AppShell';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminIssuesQuery } from '@/lib/admin';
import { formatRelative } from '@/lib/format';
import { EmptyState, LoadingBlock, QueryError } from '@/pages/settings/shared';

const route = getRouteApi('/_app/settings/history');

export function HistoryPage() {
  const { q = '' } = route.useSearch();
  const navigate = route.useNavigate();
  const [draft, setDraft] = useState(q);
  const search = useDeferredValue(draft.trim());

  useEffect(() => {
    const timer = setTimeout(() => {
      void navigate({ search: { q: draft.trim() || undefined }, replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, navigate]);

  const query = useQuery({ ...adminIssuesQuery(search), placeholderData: (previous) => previous });
  const issues = query.data?.issues ?? [];

  return (
    <SettingsPage>
      <PageHeader
        title="Corregir historial"
        description="Elegí un issue para revisar sus tramos de estado y de asignación: mover horas, borrar clicks por error o partir un tramo."
      />
      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Buscar por clave o resumen…"
          className="pl-9"
          autoFocus
        />
      </div>

      {query.isPending && <LoadingBlock />}
      {query.isError && <QueryError error={query.error} />}
      {query.data &&
        (issues.length === 0 ? (
          <EmptyState title="No hay issues que coincidan" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue</TableHead>
                <TableHead>Resumen</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Asignado</TableHead>
                <TableHead className="text-right">Tramos</TableHead>
                <TableHead>Último cambio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue) => (
                <TableRow key={issue.issue_key}>
                  <TableCell>
                    <Link
                      to="/settings/history/$issueKey"
                      params={{ issueKey: issue.issue_key }}
                      className="font-mono text-[11px] font-semibold hover:underline"
                    >
                      {issue.issue_key}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    <Link
                      to="/settings/history/$issueKey"
                      params={{ issueKey: issue.issue_key }}
                      className="hover:underline"
                    >
                      {issue.summary ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell>{issue.current_status_name ?? '—'}</TableCell>
                  <TableCell>{issue.current_assignee_name ?? 'Sin asignar'}</TableCell>
                  <TableCell className="text-right tabular-nums">{issue.segments}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelative(issue.updated_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
    </SettingsPage>
  );
}
