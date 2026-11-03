import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DownloadIcon } from 'lucide-react';

import { PageHeader, SettingsPage } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { systemQuery } from '@/lib/admin';
import { formatBytes, formatDateTimeSeconds, formatRelative } from '@/lib/format';
import { LoadingBlock, QueryError } from '@/pages/settings/shared';
import { OUTCOMES } from '@/pages/settings/WebhooksPage';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 text-xs last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function SystemPage() {
  const query = useQuery(systemQuery);
  const data = query.data;
  const last24h = Object.entries(data?.webhooks.last_24h ?? {});

  return (
    <SettingsPage>
      <PageHeader
        title="Sistema"
        description="Estado del servidor, la conexión con Jira y la base de datos."
      />
      {query.isPending && <LoadingBlock rows={4} />}
      {query.isError && <QueryError error={query.error} />}
      {data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Webhooks</CardTitle>
              <CardDescription>Lo que llegó de Jira en las últimas 24 horas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Row label="Último evento">
                {data.webhooks.last_received_at ? (
                  <span title={formatDateTimeSeconds(data.webhooks.last_received_at)}>
                    {formatRelative(data.webhooks.last_received_at)}
                  </span>
                ) : (
                  'nunca'
                )}
              </Row>
              {last24h.length === 0 ? (
                <Row label="Últimas 24 h">sin eventos</Row>
              ) : (
                last24h.map(([outcome, count]) => (
                  <Row key={outcome} label={OUTCOMES[outcome]?.label ?? outcome}>
                    <Link
                      to="/settings/webhooks"
                      search={{ outcome }}
                      className="tabular-nums hover:underline"
                    >
                      {count}
                    </Link>
                  </Row>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jira</CardTitle>
              <CardDescription>Cuenta con la que se mueven e importan tareas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Row label="Credenciales">
                {data.jira.configured ? (
                  <Badge variant="success">configuradas</Badge>
                ) : (
                  <Badge variant="warning">faltan JIRA_EMAIL y JIRA_API_TOKEN</Badge>
                )}
              </Row>
              <Row label="Instancia">
                <span className="font-mono">{data.jira.base_url ?? '—'}</span>
              </Row>
              <Row label="Zona horaria">{data.timezone}</Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Base de datos</CardTitle>
              <CardDescription>SQLite, un solo archivo.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <Row label="Tamaño">{formatBytes(data.database.bytes)}</Row>
                <Row label="Issues">{data.database.issues}</Row>
                <Row label="Tramos de estado">{data.database.status_segments}</Row>
                <Row label="Tramos de asignación">{data.database.assignee_segments}</Row>
                <Row label="Archivo">
                  <span className="font-mono break-all">{data.database.path}</span>
                </Row>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href="/api/admin/backup" download>
                  <DownloadIcon /> Descargar respaldo
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </SettingsPage>
  );
}
