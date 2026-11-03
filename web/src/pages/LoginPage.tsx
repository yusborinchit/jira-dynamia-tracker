import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { LockIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { login, sessionQuery } from '@/lib/auth';

const route = getRouteApi('/login');

export function LoginPage() {
  const { redirect } = route.useSearch();
  const navigate = route.useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const session = await login(password);
      queryClient.setQueryData(sessionQuery.queryKey, session);
      const target = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
      await navigate({ href: target, replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-5 border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex flex-col gap-1">
          <span className="flex size-9 items-center justify-center bg-primary text-primary-foreground">
            <LockIcon className="size-4" />
          </span>
          <h1 className="mt-3 text-lg font-semibold tracking-tight">Jira Tracker</h1>
          <p className="text-sm text-muted-foreground">Ingresá la contraseña del equipo.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? 'login-error' : undefined}
          />
          {error && (
            <p id="login-error" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <Button type="submit" disabled={pending || password.length === 0}>
          {pending ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </div>
  );
}
