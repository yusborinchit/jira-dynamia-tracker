import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  clearedSessionCookie,
  clearFailures,
  createSessionToken,
  isCorrectPassword,
  isLockedOut,
  isValidSessionToken,
  readCookie,
  recordFailure,
  SESSION_COOKIE,
  sessionCookie,
} from '@/services/auth.service';

const PUBLIC_PATHS = new Set([
  '/health',
  '/webhooks/jira',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session',
]);

const PROTECTED_PREFIXES = ['/api/', '/reports', '/issues', '/events'];

const loginSchema = z.object({ password: z.string().min(1).max(200) });

function pathOf(url: string): string {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}

function isProtected(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return false;
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

export function hasSession(request: FastifyRequest): boolean {
  return isValidSessionToken(readCookie(request.headers.cookie, SESSION_COOKIE));
}

function isSecure(request: FastifyRequest): boolean {
  return request.protocol === 'https';
}

export function installAuthGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!isProtected(pathOf(request.url))) return;
    if (hasSession(request)) return;
    return reply.code(401).send({ error: 'unauthenticated' });
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/session', async (request, reply) => {
    return reply.send({ authenticated: hasSession(request) });
  });

  app.post('/api/auth/login', async (request, reply) => {
    if (isLockedOut(request.ip)) {
      return reply.code(429).send({
        error: 'too_many_attempts',
        message: 'Demasiados intentos fallidos. Probá de nuevo en 15 minutos.',
      });
    }

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success || !isCorrectPassword(parsed.data.password)) {
      recordFailure(request.ip);
      request.log.warn({ ip: request.ip }, 'failed login');
      return reply.code(401).send({ error: 'wrong_password', message: 'Contraseña incorrecta.' });
    }

    clearFailures(request.ip);
    reply.header('set-cookie', sessionCookie(createSessionToken(), isSecure(request)));
    return reply.send({ authenticated: true });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    reply.header('set-cookie', clearedSessionCookie(isSecure(request)));
    return reply.send({ authenticated: false });
  });
}
