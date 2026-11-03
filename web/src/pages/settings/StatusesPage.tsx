import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';

import { PageHeader, SettingsPage } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type StatusEntry, statusesQuery, useAdminMutation } from '@/lib/admin';
import { api } from '@/lib/api';
import {
  CategorySelect,
  EmptyState,
  LoadingBlock,
  Notice,
  QueryError,
} from '@/pages/settings/shared';

interface MappingChange {
  entry: StatusEntry;
  category: string | null;
}

export function StatusesPage() {
  const query = useQuery(statusesQuery);
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const switchId = useId();

  const save = useAdminMutation(
    ({ entry, category }: MappingChange) =>
      api('/api/admin/status-mapping', {
        method: 'PUT',
        body: {
          scope: entry.mapped_by === 'id' ? 'id' : 'name',
          status_id: entry.status_id,
          status_name: entry.status_name,
          category,
        },
      }),
    { success: 'Mapeo guardado. Los reportes ya usan la categoría nueva.' },
  );

  const statuses = query.data?.statuses ?? [];
  const unmapped = statuses.filter((entry) => entry.category === null).length;
  const visible = useMemo(
    () => (onlyUnmapped ? statuses.filter((entry) => entry.category === null) : statuses),
    [onlyUnmapped, statuses],
  );

  return (
    <SettingsPage>
      <PageHeader
        title="Estados"
        description="Cada estado de Jira se agrupa en una categoría, que es lo que muestran los reportes. Los estados nuevos aparecen solos cuando llega el primer webhook; cambiar una categoría recalcula todo el historial."
        actions={
          <div className="flex items-center gap-2 text-xs">
            <Switch id={switchId} checked={onlyUnmapped} onCheckedChange={setOnlyUnmapped} />
            <label htmlFor={switchId}>Solo sin categoría</label>
          </div>
        }
      />

      {unmapped > 0 && (
        <Notice tone="warning">
          Hay {unmapped} estado{unmapped === 1 ? '' : 's'} sin categoría. Su tiempo se cuenta como
          "Sin categoría" hasta que les asignes una.
        </Notice>
      )}

      {query.isPending && <LoadingBlock />}
      {query.isError && <QueryError error={query.error} />}

      {query.data &&
        (visible.length === 0 ? (
          <EmptyState title="No hay estados para mostrar">
            {onlyUnmapped
              ? 'Todos los estados tienen categoría.'
              : 'Todavía no llegó ningún webhook.'}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado en Jira</TableHead>
                <TableHead>Proyectos</TableHead>
                <TableHead className="text-right">Tramos</TableHead>
                <TableHead className="text-right">Issues ahora</TableHead>
                <TableHead>Categoría</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((entry) => (
                <TableRow
                  key={`${entry.status_id ?? ''}|${entry.status_name}`}
                  className={entry.category === null ? 'bg-amber-500/5' : undefined}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.status_name}</span>
                      {entry.status_id && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          #{entry.status_id}
                        </span>
                      )}
                      {entry.mapped_by === 'id' && <Badge variant="outline">por id</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">
                    {entry.projects.join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{entry.segments}</TableCell>
                  <TableCell className="text-right tabular-nums">{entry.current_issues}</TableCell>
                  <TableCell>
                    <CategorySelect
                      value={entry.category}
                      disabled={save.isPending}
                      onChange={(category) => save.mutate({ entry, category })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
    </SettingsPage>
  );
}
