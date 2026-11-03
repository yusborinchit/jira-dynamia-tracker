import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  CloudDownloadIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ScissorsIcon,
  Trash2Icon,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';

import { PageHeader, SettingsPage } from '@/components/layout/AppShell';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { type IssueHistory, issueHistoryQuery, useAdminMutation } from '@/lib/admin';
import { api } from '@/lib/api';
import { formatDateTimeSeconds, formatSpan, fromLocalInput, toLocalInput } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LoadingBlock, Notice, QueryError, Swatch } from '@/pages/settings/shared';

const route = getRouteApi('/_app/settings/history/$issueKey');

type Kind = 'status' | 'assignee';

const MISCLICK_SECONDS = 60;
const UNASSIGNED_VALUE = '__unassigned__';

interface Segment {
  id: number;
  label: string;
  color: string | null;
  enteredAt: string;
  leftAt: string | null;
  labelValue: string;
}

function statusValue(statusId: string | null, statusName: string): string {
  return JSON.stringify([statusId, statusName]);
}

function segmentsOf(data: IssueHistory, kind: Kind): Segment[] {
  if (kind === 'status') {
    return data.status_segments.map((segment) => ({
      id: segment.id,
      label: segment.status_name,
      color: segment.color,
      enteredAt: segment.entered_at,
      leftAt: segment.left_at,
      labelValue: statusValue(segment.status_id, segment.status_name),
    }));
  }
  return data.assignee_segments.map((segment) => ({
    id: segment.id,
    label: segment.account_id ? (segment.display_name ?? segment.account_id) : 'Sin asignar',
    color: null,
    enteredAt: segment.entered_at,
    leftAt: segment.left_at,
    labelValue: segment.account_id ?? UNASSIGNED_VALUE,
  }));
}

function labelOptions(data: IssueHistory, kind: Kind): { value: string; label: string }[] {
  if (kind === 'status') {
    const seen = new Map<string, string>();
    for (const option of data.options.statuses) {
      seen.set(statusValue(option.status_id, option.status_name), option.status_name);
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }
  return [
    { value: UNASSIGNED_VALUE, label: 'Sin asignar' },
    ...data.options.people.map((person) => ({
      value: person.account_id,
      label: person.display_name,
    })),
  ];
}

function labelBody(kind: Kind, value: string): Record<string, unknown> {
  if (kind === 'status') {
    const [statusId, statusName] = JSON.parse(value) as [string | null, string];
    return { status_id: statusId, status_name: statusName };
  }
  return { account_id: value === UNASSIGNED_VALUE ? null : value };
}

function LabelSelect({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Elegí…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StripTimeline({ segments }: { segments: Segment[] }) {
  const first = segments[0];
  if (!first) return null;
  const start = Date.parse(first.enteredAt);
  const end = Math.max(
    Date.now(),
    ...segments.map((segment) => (segment.leftAt ? Date.parse(segment.leftAt) : Date.now())),
  );
  const total = Math.max(1, end - start);

  return (
    <div className="flex h-3 w-full overflow-hidden border border-border bg-muted">
      {segments.map((segment) => {
        const from = Date.parse(segment.enteredAt);
        const to = segment.leftAt ? Date.parse(segment.leftAt) : Date.now();
        return (
          <div
            key={segment.id}
            title={`${segment.label} · ${formatSpan(segment.enteredAt, segment.leftAt)}`}
            style={{
              width: `${((to - from) / total) * 100}%`,
              background: segment.color ?? '#94a3b8',
            }}
            className="h-full border-r border-background/60 last:border-r-0"
          />
        );
      })}
    </div>
  );
}

type Dialogs =
  | { type: 'edit'; segment: Segment }
  | { type: 'split'; segment: Segment }
  | { type: 'delete'; segment: Segment }
  | null;

function SegmentsTable({
  issueKey,
  data,
  kind,
}: {
  issueKey: string;
  data: IssueHistory;
  kind: Kind;
}) {
  const segments = useMemo(() => segmentsOf(data, kind), [data, kind]);
  const options = useMemo(() => labelOptions(data, kind), [data, kind]);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [labelValue, setLabelValue] = useState('');
  const [enteredAt, setEnteredAt] = useState('');
  const [leftAt, setLeftAt] = useState('');
  const [splitAt, setSplitAt] = useState('');

  const base = `/api/admin/issues/${encodeURIComponent(issueKey)}/segments/${kind}`;
  const close = () => setDialog(null);

  const edit = useAdminMutation(
    ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api(`${base}/${id}`, { method: 'PATCH', body }),
    { success: 'Tramo actualizado.', onSuccess: close },
  );
  const split = useAdminMutation(
    ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api(`${base}/${id}/split`, { method: 'POST', body }),
    { success: 'Tramo partido.', onSuccess: close },
  );
  const remove = useAdminMutation((id: number) => api(`${base}/${id}`, { method: 'DELETE' }), {
    success: 'Tramo borrado.',
    onSuccess: close,
  });

  const openEdit = (segment: Segment) => {
    setLabelValue(segment.labelValue);
    setEnteredAt(toLocalInput(segment.enteredAt));
    setLeftAt(segment.leftAt ? toLocalInput(segment.leftAt) : '');
    setDialog({ type: 'edit', segment });
  };

  const openSplit = (segment: Segment) => {
    const from = Date.parse(segment.enteredAt);
    const to = segment.leftAt ? Date.parse(segment.leftAt) : Date.now();
    setSplitAt(toLocalInput(new Date(from + (to - from) / 2).toISOString()));
    setLabelValue('');
    setDialog({ type: 'split', segment });
  };

  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    if (dialog?.type !== 'edit') return;
    const { segment } = dialog;
    const body: Record<string, unknown> = {};
    if (labelValue !== segment.labelValue) Object.assign(body, labelBody(kind, labelValue));
    if (enteredAt !== toLocalInput(segment.enteredAt)) body.entered_at = fromLocalInput(enteredAt);
    if (segment.leftAt && leftAt && leftAt !== toLocalInput(segment.leftAt)) {
      body.left_at = fromLocalInput(leftAt);
    }
    if (Object.keys(body).length === 0) {
      close();
      return;
    }
    edit.mutate({ id: segment.id, body });
  };

  const submitSplit = (event: FormEvent) => {
    event.preventDefault();
    if (dialog?.type !== 'split' || !labelValue) return;
    split.mutate({
      id: dialog.segment.id,
      body: { at: fromLocalInput(splitAt), ...labelBody(kind, labelValue) },
    });
  };

  const noun = kind === 'status' ? 'estado' : 'persona';

  return (
    <>
      <StripTimeline segments={segments} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{kind === 'status' ? 'Estado' : 'Asignado'}</TableHead>
            <TableHead>Desde</TableHead>
            <TableHead>Hasta</TableHead>
            <TableHead className="text-right">Duración</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {segments.map((segment) => {
            const seconds =
              ((segment.leftAt ? Date.parse(segment.leftAt) : Date.now()) -
                Date.parse(segment.enteredAt)) /
              1000;
            const misclick = segment.leftAt !== null && seconds < MISCLICK_SECONDS;
            return (
              <TableRow key={segment.id} className={cn(misclick && 'bg-amber-500/5')}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {kind === 'status' && <Swatch color={segment.color} />}
                    <span className="font-medium">{segment.label}</span>
                    {segment.leftAt === null && <Badge variant="success">actual</Badge>}
                    {misclick && (
                      <Badge variant="warning" title="Duró menos de un minuto">
                        posible click por error
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatDateTimeSeconds(segment.enteredAt)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {segment.leftAt ? formatDateTimeSeconds(segment.leftAt) : 'sigue abierto'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatSpan(segment.enteredAt, segment.leftAt)}
                </TableCell>
                <TableCell className="w-10 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Acciones del tramo">
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openEdit(segment)}>
                        <PencilIcon /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openSplit(segment)}>
                        <ScissorsIcon /> Partir en dos
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        destructive
                        disabled={segments.length === 1}
                        onSelect={() => setDialog({ type: 'delete', segment })}
                      >
                        <Trash2Icon /> Borrar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={dialog?.type === 'edit'} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <form onSubmit={submitEdit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Editar tramo</DialogTitle>
              <DialogDescription>
                Si movés el inicio o el fin, el tramo vecino se ajusta para que no queden huecos.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label className="capitalize">{noun}</Label>
              <LabelSelect options={options} value={labelValue} onChange={setLabelValue} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="segment-from">Desde</Label>
                <Input
                  id="segment-from"
                  type="datetime-local"
                  step={1}
                  value={enteredAt}
                  onChange={(event) => setEnteredAt(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="segment-to">Hasta</Label>
                <Input
                  id="segment-to"
                  type="datetime-local"
                  step={1}
                  value={leftAt}
                  disabled={dialog?.type === 'edit' && dialog.segment.leftAt === null}
                  onChange={(event) => setLeftAt(event.target.value)}
                />
                {dialog?.type === 'edit' && dialog.segment.leftAt === null && (
                  <span className="text-[11px] text-muted-foreground">
                    Es el tramo actual: se cierra cuando cambie en Jira.
                  </span>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={edit.isPending}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.type === 'split'} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <form onSubmit={submitSplit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Partir tramo</DialogTitle>
              <DialogDescription>
                Desde el momento elegido hasta el final del tramo, pasa a otro {noun}. Sirve para
                registrar un cambio que no llegó por webhook.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="split-at">A partir de</Label>
              <Input
                id="split-at"
                type="datetime-local"
                step={1}
                value={splitAt}
                onChange={(event) => setSplitAt(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="capitalize">{noun} nuevo</Label>
              <LabelSelect options={options} value={labelValue} onChange={setLabelValue} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={split.isPending || !labelValue || !splitAt}>
                Partir
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog?.type === 'delete'}
        onOpenChange={(open) => !open && close()}
        title="¿Borrar este tramo?"
        description="Su tiempo pasa al tramo anterior. Si el anterior y el siguiente son iguales, se unen en uno solo, que es lo que querés para un click por error."
        confirmLabel="Borrar tramo"
        destructive
        pending={remove.isPending}
        onConfirm={() => dialog?.type === 'delete' && remove.mutate(dialog.segment.id)}
      />
    </>
  );
}

export function HistoryDetailPage() {
  const { issueKey } = route.useParams();
  const navigate = route.useNavigate();
  const query = useQuery(issueHistoryQuery(issueKey));
  const [kind, setKind] = useState<Kind>('status');
  const [confirm, setConfirm] = useState<'reimport' | 'delete' | null>(null);

  const reimport = useAdminMutation(
    () => api(`/api/admin/import/issues/${encodeURIComponent(issueKey)}`, { method: 'POST' }),
    { success: 'Historial reconstruido desde Jira.', onSettled: () => setConfirm(null) },
  );
  const remove = useAdminMutation(
    () => api(`/api/admin/issues/${encodeURIComponent(issueKey)}`, { method: 'DELETE' }),
    {
      success: `${issueKey} eliminado del tracker.`,
      onSuccess: () => navigate({ to: '/settings/history', search: {} }),
    },
  );

  const data = query.data;

  return (
    <SettingsPage>
      <div>
        <Link
          to="/settings/history"
          search={{}}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" /> Todos los issues
        </Link>
      </div>
      <PageHeader
        title={issueKey}
        description={data?.issue.summary ?? undefined}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirm('reimport')}>
              <CloudDownloadIcon /> Reconstruir desde Jira
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirm('delete')}>
              <Trash2Icon /> Eliminar
            </Button>
          </>
        }
      />

      {query.isPending && <LoadingBlock />}
      {query.isError && <QueryError error={query.error} />}

      {data && (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              Proyecto <strong className="text-foreground">{data.issue.project_key}</strong>
            </span>
            <span>
              Estado actual{' '}
              <strong className="text-foreground">{data.issue.current_status_name ?? '—'}</strong>
            </span>
            <span>
              Asignado{' '}
              <strong className="text-foreground">
                {data.issue.current_assignee_name ?? 'Sin asignar'}
              </strong>
            </span>
          </div>

          <div className="inline-flex w-fit border border-border p-0.5" role="tablist">
            {(
              [
                ['status', `Estados (${data.status_segments.length})`],
                ['assignee', `Asignaciones (${data.assignee_segments.length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={kind === value}
                onClick={() => setKind(value)}
                className={cn(
                  'cursor-pointer px-3 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
                  kind === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <SegmentsTable issueKey={issueKey} data={data} kind={kind} />

          <Notice>
            Las horas de los reportes salen de estos tramos, recortadas al horario laboral. Los
            cambios se ven en el dashboard al instante.
          </Notice>
        </>
      )}

      <ConfirmDialog
        open={confirm === 'reimport'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="¿Reconstruir desde Jira?"
        description="Se descarta el historial guardado de este issue, incluidas las correcciones a mano, y se vuelve a armar con el changelog de Jira desde que se creó."
        confirmLabel="Reconstruir"
        pending={reimport.isPending}
        onConfirm={() => reimport.mutate(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`¿Eliminar ${issueKey} del tracker?`}
        description="Se borran el issue y todo su historial de esta base. En Jira no cambia nada; si vuelve a moverse, reaparece."
        confirmLabel="Eliminar"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </SettingsPage>
  );
}
