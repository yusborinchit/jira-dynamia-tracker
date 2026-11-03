import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';

import { PageHeader, SettingsPage } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { webhookQuery, webhooksQuery } from '@/lib/admin';
import { formatDateTimeSeconds } from '@/lib/format';
import { EmptyState, LoadingBlock, QueryError } from '@/pages/settings/shared';

const route = getRouteApi('/_app/settings/webhooks');

const ALL = '__all__';

export const OUTCOMES: Record<
  string,
  { label: string; variant: 'success' | 'secondary' | 'outline' | 'warning' | 'destructive' }
> = {
  applied: { label: 'Aplicado', variant: 'success' },
  duplicate: { label: 'Repetido', variant: 'secondary' },
  ignored: { label: 'Ignorado', variant: 'outline' },
  invalid: { label: 'Inválido', variant: 'warning' },
  unauthorized: { label: 'Secreto inválido', variant: 'destructive' },
  error: { label: 'Error', variant: 'destructive' },
};

const REASONS: Record<string, string> = {
  no_tracked_change: 'No cambió el estado ni el asignado',
  missing_status: 'El evento no trae estado',
  missing_issue: 'El evento no trae issue',
  unsupported_event: 'Tipo de evento no soportado',
  missing_secret: 'Falta el header X-Webhook-Secret',
  wrong_secret: 'El secreto no coincide',
  invalid_payload: 'El cuerpo no tiene el formato esperado',
  apply_failed: 'Falló al guardar',
};

function prettyBody(body: string | null | undefined): string {
  if (!body) return '(sin cuerpo guardado)';
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function EventDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const query = useQuery({ ...webhookQuery(id ?? 0), enabled: id !== null });
  const event = query.data;

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Evento #{id}</DialogTitle>
        </DialogHeader>
        {query.isPending && <LoadingBlock rows={4} />}
        {event && (
          <div className="flex flex-col gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Badge variant={OUTCOMES[event.outcome]?.variant ?? 'outline'}>
                {OUTCOMES[event.outcome]?.label ?? event.outcome}
              </Badge>
              <span>{formatDateTimeSeconds(event.received_at)}</span>
              <span className="font-mono">{event.event}</span>
              {event.retries > 0 && <span>{event.retries} reintento(s) de Jira</span>}
            </div>
            {(event.reason || event.detail) && (
              <p className="text-muted-foreground">
                {event.reason ? (REASONS[event.reason] ?? event.reason) : null}
                {event.reason && event.detail ? ' · ' : null}
                {event.detail}
              </p>
            )}
            <pre className="max-h-[55vh] overflow-auto border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
              {prettyBody(event.body)}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WebhooksPage() {
  const { outcome = '', issue = '' } = route.useSearch();
  const navigate = route.useNavigate();
  const [selected, setSelected] = useState<number | null>(null);
  const query = useQuery(webhooksQuery(outcome, issue.trim().toUpperCase()));
  const events = query.data?.events ?? [];

  const setFilter = (next: { outcome?: string; issue?: string }) =>
    void navigate({
      search: (previous) => ({
        outcome: (next.outcome ?? previous.outcome) || undefined,
        issue: (next.issue ?? previous.issue) || undefined,
      }),
      replace: true,
    });

  return (
    <SettingsPage>
      <PageHeader
        title="Webhooks"
        description="Todo lo que mandó Jira, con lo que hizo el tracker con cada evento. Los reintentos de Jira se agrupan en la misma fila. Se guardan los últimos 2000."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={outcome || ALL}
          onValueChange={(value) => setFilter({ outcome: value === ALL ? '' : value })}
        >
          <SelectTrigger size="sm" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los resultados</SelectItem>
            {Object.entries(OUTCOMES).map(([value, meta]) => (
              <SelectItem key={value} value={value}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          defaultValue={issue}
          onChange={(event) => setFilter({ issue: event.target.value })}
          placeholder="Filtrar por issue (CRM-12)"
          className="h-8 w-56 font-mono text-xs"
        />
        <span className="text-[11px] text-muted-foreground">Se actualiza cada 15 segundos.</span>
      </div>

      {query.isPending && <LoadingBlock />}
      {query.isError && <QueryError error={query.error} />}
      {query.data &&
        (events.length === 0 ? (
          <EmptyState title="No hay eventos">
            Si esperabas ver algo, revisá en Jira que el webhook apunte a /webhooks/jira y mande el
            header con el secreto.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recibido</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow
                  key={event.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(event.id)}
                >
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatDateTimeSeconds(event.received_at)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px]">
                    {event.event.replace(/^jira:/, '')}
                  </TableCell>
                  <TableCell>
                    {event.issue_key ? (
                      <Link
                        to="/settings/history/$issueKey"
                        params={{ issueKey: event.issue_key }}
                        onClick={(clickEvent) => clickEvent.stopPropagation()}
                        className="font-mono text-[11px] font-semibold hover:underline"
                      >
                        {event.issue_key}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <Badge variant={OUTCOMES[event.outcome]?.variant ?? 'outline'}>
                        {OUTCOMES[event.outcome]?.label ?? event.outcome}
                      </Badge>
                      {event.retries > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          ×{event.retries + 1}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {[event.reason ? (REASONS[event.reason] ?? event.reason) : null, event.detail]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <EventDialog id={selected} onClose={() => setSelected(null)} />
    </SettingsPage>
  );
}
