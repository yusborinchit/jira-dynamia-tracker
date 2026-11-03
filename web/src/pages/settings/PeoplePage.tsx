import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { PageHeader, SettingsPage } from '@/components/layout/AppShell';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type KnownPerson, peopleQuery, useAdminMutation } from '@/lib/admin';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { EmptyState, LoadingBlock, QueryError } from '@/pages/settings/shared';

function PersonAvatar({ person }: { person: KnownPerson }) {
  const [failed, setFailed] = useState(false);
  const name = person.alias ?? person.jira_name;
  if (person.avatar_url && !failed) {
    return (
      <img
        src={person.avatar_url}
        alt=""
        className="size-7 flex-none"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="flex size-7 flex-none items-center justify-center bg-muted text-[11px] font-semibold text-muted-foreground">
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0))
        .join('')
        .toUpperCase()}
    </span>
  );
}

function PersonRow({ person }: { person: KnownPerson }) {
  const [alias, setAlias] = useState(person.alias ?? '');
  useEffect(() => setAlias(person.alias ?? ''), [person.alias]);

  const save = useAdminMutation(
    (next: { alias: string | null; hidden: boolean }) =>
      api(`/api/admin/people/${encodeURIComponent(person.account_id)}`, {
        method: 'PUT',
        body: next,
      }),
    { success: 'Guardado.' },
  );

  const commitAlias = () => {
    const next = alias.trim() || null;
    if (next === (person.alias ?? null)) return;
    save.mutate({ alias: next, hidden: person.hidden });
  };

  return (
    <TableRow className={person.hidden ? 'opacity-60' : undefined}>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <PersonAvatar person={person} />
          <div className="min-w-0">
            <div className="truncate font-medium">{person.jira_name}</div>
            <div className="truncate font-mono text-[10px] text-muted-foreground">
              {person.account_id}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Input
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
          onBlur={commitAlias}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setAlias(person.alias ?? '');
          }}
          placeholder={person.jira_name}
          className="h-8 w-52 text-xs"
          aria-label={`Nombre a mostrar para ${person.jira_name}`}
        />
      </TableCell>
      <TableCell>
        <Switch
          checked={!person.hidden}
          disabled={save.isPending}
          onCheckedChange={(visible) => save.mutate({ alias: person.alias, hidden: !visible })}
          aria-label={`Mostrar a ${person.jira_name} en el panel del equipo`}
        />
      </TableCell>
      <TableCell className="text-right tabular-nums">{person.current_issues}</TableCell>
      <TableCell className="text-muted-foreground">{formatRelative(person.last_seen_at)}</TableCell>
    </TableRow>
  );
}

export function PeoplePage() {
  const query = useQuery(peopleQuery);
  const people = query.data?.people ?? [];

  return (
    <SettingsPage>
      <PageHeader
        title="Personas"
        description="Gente que alguna vez tuvo una tarea asignada. El alias reemplaza el nombre de Jira en todos los reportes; ocultar a alguien lo saca del panel de trabajo actual, pero sus horas se siguen contando."
      />
      {query.isPending && <LoadingBlock />}
      {query.isError && <QueryError error={query.error} />}
      {query.data &&
        (people.length === 0 ? (
          <EmptyState title="Todavía no hay personas">
            Aparecen cuando llega el primer webhook con una asignación.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona en Jira</TableHead>
                <TableHead>Mostrar como</TableHead>
                <TableHead>En el panel</TableHead>
                <TableHead className="text-right">Tareas actuales</TableHead>
                <TableHead>Última actividad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => (
                <PersonRow key={person.account_id} person={person} />
              ))}
            </TableBody>
          </Table>
        ))}
    </SettingsPage>
  );
}
