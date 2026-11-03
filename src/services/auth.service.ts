import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '@/env';

export const SESSION_COOKIE = 'jt_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

const signingKey = createHash('sha256')
  .update(`jira-tracker-session:${env.APP_PASSWORD}:${env.JIRA_WEBHOOK_SECRET}`)
  .digest();

function sign(value: string): Buffer {
  return createHmac('sha256', signingKey).update(value).digest();
}

export function createSessionToken(now = Date.now()): string {
  const expiresAt = String(now + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expiresAt}.${sign(expiresAt).toString('base64url')}`;
}

export function isValidSessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [expiresAt, signature] = token.split('.');
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= now) return false;

  const expected = sign(expiresAt);
  const provided = Buffer.from(signature, 'base64url');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function isCorrectPassword(password: string): boolean {
  return timingSafeEqual(sign(`password:${password}`), sign(`password:${env.APP_PASSWORD}`));
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

export function sessionCookie(token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearedSessionCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

const failures = new Map<string, { count: number; resetAt: number }>();

export function isLockedOut(ip: string, now = Date.now()): boolean {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (entry.resetAt <= now) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED_ATTEMPTS;
}

export function recordFailure(ip: string, now = Date.now()): void {
  const entry = failures.get(ip);
  if (!entry || entry.resetAt <= now) {
    failures.set(ip, { count: 1, resetAt: now + LOCKOUT_MS });
    return;
  }
  entry.count += 1;
}

export function clearFailures(ip: string): void {
  failures.delete(ip);
}
