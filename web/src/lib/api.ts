export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type UnauthorizedListener = () => void;

let unauthorizedListener: UnauthorizedListener | null = null;

export function onUnauthorized(listener: UnauthorizedListener): void {
  unauthorizedListener = listener;
}

const FALLBACK_MESSAGES: Record<number, string> = {
  401: 'La sesión expiró. Volvé a entrar.',
  404: 'No se encontró.',
  429: 'Demasiados intentos. Esperá unos minutos.',
  502: 'Jira no respondió bien.',
  503: 'El servicio no está configurado.',
};

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
    signal: init.signal,
  });

  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    unauthorizedListener?.();
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new ApiError(
      response.status,
      body?.error ?? 'request_failed',
      body?.message ??
        FALLBACK_MESSAGES[response.status] ??
        `El servidor respondió ${response.status}.`,
    );
  }

  return (response.status === 204 ? null : await response.json()) as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Algo salió mal.';
}
