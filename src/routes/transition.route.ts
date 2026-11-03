import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { fetchTransitions, JiraError, transitionIssue } from '@/services/jira-client';

const paramsSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]*-\d+$/, 'expected an issue key like ABC-123'),
});

const bodySchema = z.object({
  transitionId: z.string().regex(/^\d+$/),
});

function sendJiraError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  issueKey: string,
): FastifyReply {
  if (error instanceof JiraError) {
    request.log.warn(
      { issue: issueKey, status: error.status, detail: error.message },
      'jira error',
    );
    if (error.status === 0) return reply.code(503).send({ error: 'jira_not_configured' });
    if (error.status === 404) return reply.code(404).send({ error: 'issue_not_found' });
    if (error.status === 401 || error.status === 403) {
      return reply.code(502).send({ error: 'jira_unauthorized' });
    }
    return reply.code(502).send({ error: 'jira_error', status: error.status });
  }

  request.log.error({ err: error, issue: issueKey }, 'jira request failed');
  return reply.code(502).send({ error: 'jira_unreachable' });
}

export async function transitionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/issues/:issueKey/transitions', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_issue_key' });
    }

    try {
      return reply.send(await fetchTransitions(params.data.issueKey));
    } catch (error) {
      return sendJiraError(request, reply, error, params.data.issueKey);
    }
  });

  app.post('/issues/:issueKey/transitions', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = bodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: 'invalid_request' });
    }

    const { issueKey } = params.data;
    try {
      await transitionIssue(issueKey, body.data.transitionId);
      request.log.info({ issue: issueKey, transition: body.data.transitionId }, 'issue moved');
      return reply.send({ ok: true });
    } catch (error) {
      return sendJiraError(request, reply, error, issueKey);
    }
  });
}
