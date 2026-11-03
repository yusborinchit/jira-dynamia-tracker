import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { issueChanged, parseOrReply, sendError } from '@/routes/admin/shared';
import { importIssueFromJira } from '@/services/import.service';
import { isJiraConfigured, JiraError, searchIssueKeys } from '@/services/jira-client';

const searchSchema = z.object({
  jql: z.string().trim().min(1).max(2_000),
  limit: z.number().int().min(1).max(500).default(200),
});

const issueKeySchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]*-\d+$/, 'clave de issue inválida'),
});

function sendJiraFailure(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
): FastifyReply {
  if (error instanceof JiraError) {
    request.log.warn({ status: error.status, detail: error.message }, 'jira import error');
    if (error.status === 400) {
      return sendError(
        reply,
        400,
        'jira_bad_request',
        `Jira rechazó la consulta: ${error.message}`,
      );
    }
    if (error.status === 404) {
      return sendError(reply, 404, 'issue_not_found', 'Jira no encuentra el issue.');
    }
    if (error.status === 401 || error.status === 403) {
      return sendError(reply, 502, 'jira_unauthorized', 'Jira rechazó las credenciales.');
    }
    return sendError(reply, 502, 'jira_error', `Jira respondió ${error.status}.`);
  }
  request.log.error({ err: error }, 'jira import failed');
  return sendError(reply, 502, 'jira_unreachable', 'No se pudo hablar con Jira.');
}

export async function adminImportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/admin/import')) return;
    if (!isJiraConfigured()) {
      return sendError(
        reply,
        503,
        'jira_not_configured',
        'Falta configurar JIRA_EMAIL y JIRA_API_TOKEN en el servidor.',
      );
    }
  });

  app.post('/api/admin/import/search', async (request, reply) => {
    const parsed = parseOrReply(searchSchema, request.body, reply);
    if (!parsed.ok) return reply;
    try {
      return reply.send({ keys: await searchIssueKeys(parsed.data.jql, parsed.data.limit) });
    } catch (error) {
      return sendJiraFailure(request, reply, error);
    }
  });

  app.post('/api/admin/import/issues/:issueKey', async (request, reply) => {
    const parsed = parseOrReply(issueKeySchema, request.params, reply);
    if (!parsed.ok) return reply;
    try {
      const result = await importIssueFromJira(parsed.data.issueKey);
      issueChanged(result.issueKey);
      return reply.send(result);
    } catch (error) {
      return sendJiraFailure(request, reply, error);
    }
  });
}
