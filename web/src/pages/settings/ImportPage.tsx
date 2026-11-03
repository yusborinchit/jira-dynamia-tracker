import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CheckIcon, CloudDownloadIcon, XIcon } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader, SettingsPage } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ImportResult } from '@/lib/admin';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Notice } from '@/pages/settings/shared';

type ItemState =
  | { key: string; status: 'pending' }
  | { key: string; status: 'done'; result: ImportResult }
  | { key: string; status: 'failed'; error: string };

const JQL_EXAMPLES = [
  'project = CRM AND updated >= -30d',
  'updated >= startOfMonth()',
  'assignee = currentUser() AND statusCategory != Done',
];

function importIssue(key: string): Promise<ImportResult> {
  return api<ImportResult>(`/api/admin/import/issues/${encodeURIComponent(key)}`, {
    method: 'POST',
  });
}

function ResultList({ items }: { items: ItemState[] }) {
  return (
    <ul className="max-h-96 overflow-y-auto border border-border text-xs">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0"
        >
          {item.status === 'pending' && (
            <span className="size-3.5 text-center text-muted-foreground">·</span>
          )}
          {item.status === 'done' && <CheckIcon className="size-3.5 text-success" />}
          {item.status === 'failed' && <XIcon className="size-3.5 text-destructive" />}
          <Link
            to="/settings/history/$issueKey"
            params={{ issueKey: item.key }}
            className="font-mono font-semibold hover:underline"
          >
            {item.key}
          </Link>
          {item.status === 'done' && (
            <span className="truncate text-muted-foreground">
              {item.result.summary} · {item.result.statusSegments} tramos desde{' '}
              {formatDateTime(item.result.since)}
            </span>
          )}
          {item.status === 'failed' && <span className="text-destructive">{item.error}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ImportPage() {
  const queryClient = useQueryClient();
  const [singleKey, setSingleKey] = useState('');
  const [jql, setJql] = useState('');
  const [limit, setLimit] = useState(100);
  const [items, setItems] = useState<ItemState[]>([]);
  const [phase, setPhase] = useState<'idle' | 'searching' | 'importing'>('idle');
  const cancelled = useRef(false);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['report'] }),
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
    ]);

  const runImport = async (keys: string[]) => {
    cancelled.current = false;
    setPhase('importing');
    setItems(keys.map((key) => ({ key, status: 'pending' })));
    let failures = 0;
    for (const key of keys) {
      if (cancelled.current) break;
      try {
        const result = await importIssue(key);
        setItems((current) =>
          current.map((item) => (item.key === key ? { key, status: 'done', result } : item)),
        );
      } catch (error) {
        failures += 1;
        setItems((current) =>
          current.map((item) =>
            item.key === key ? { key, status: 'failed', error: errorMessage(error) } : item,
          ),
        );
      }
    }
    setPhase('idle');
    await refresh();
    if (failures > 0) toast.error(`${failures} issue(s) no se pudieron importar.`);
    else toast.success('Importación terminada.');
  };

  const submitSingle = (event: FormEvent) => {
    event.preventDefault();
    const key = singleKey.trim().toUpperCase();
    if (!key) return;
    void runImport([key]);
  };

  const submitJql = async (event: FormEvent) => {
    event.preventDefault();
    setPhase('searching');
    try {
      const { keys } = await api<{ keys: string[] }>('/api/admin/import/search', {
        method: 'POST',
        body: { jql: jql.trim(), limit },
      });
      if (keys.length === 0) {
        toast.info('La consulta no devolvió issues.');
        setPhase('idle');
        return;
      }
      await runImport(keys);
    } catch (error) {
      toast.error(errorMessage(error));
      setPhase('idle');
    }
  };

  const done = items.filter((item) => item.status !== 'pending').length;
  const busy = phase !== 'idle';

  return (
    <SettingsPage>
      <PageHeader
        title="Importar de Jira"
        description="Reconstruye el historial completo de un issue con el changelog de Jira, desde que se creó. Sirve para traer lo que pasó antes de instalar el tracker o para reparar un issue con webhooks perdidos."
      />

      <Notice tone="warning">
        Importar reemplaza el historial guardado de cada issue, incluidas las correcciones hechas a
        mano. Solo lee de Jira: no cambia nada allá.
      </Notice>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Un issue</CardTitle>
            <CardDescription>Por clave, por ejemplo CRM-12.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitSingle} className="flex gap-2">
              <Input
                value={singleKey}
                onChange={(event) => setSingleKey(event.target.value)}
                placeholder="CRM-12"
                className="font-mono"
                aria-label="Clave del issue"
              />
              <Button type="submit" disabled={busy || !singleKey.trim()}>
                <CloudDownloadIcon /> Importar
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Varios issues por JQL</CardTitle>
            <CardDescription>Se importan de a uno, en orden.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitJql} className="flex flex-col gap-3">
              <Textarea
                value={jql}
                onChange={(event) => setJql(event.target.value)}
                placeholder={JQL_EXAMPLES[0]}
                className="min-h-16 font-mono text-xs"
                aria-label="Consulta JQL"
              />
              <div className="flex flex-wrap gap-1">
                {JQL_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setJql(example)}
                    className="cursor-pointer border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import-limit">Máximo</Label>
                  <Input
                    id="import-limit"
                    type="number"
                    min={1}
                    max={500}
                    value={limit}
                    onChange={(event) =>
                      setLimit(Math.min(500, Math.max(1, Number(event.target.value) || 1)))
                    }
                    className="h-9 w-24"
                  />
                </div>
                <Button type="submit" disabled={busy || !jql.trim()}>
                  {phase === 'searching' ? 'Buscando…' : 'Buscar e importar'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {items.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {phase === 'importing' ? 'Importando' : 'Resultado'} · {done}/{items.length}
            </h2>
            {phase === 'importing' && (
              <Button size="xs" variant="outline" onClick={() => (cancelled.current = true)}>
                Detener
              </Button>
            )}
          </div>
          <div className="h-1.5 w-full bg-muted">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${(done / items.length) * 100}%` }}
            />
          </div>
          <ResultList items={items} />
        </section>
      )}
    </SettingsPage>
  );
}
