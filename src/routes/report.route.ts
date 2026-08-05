import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { buildMonthlyReport } from '@/services/report.service';
import { currentMonth } from '@/utils/time';
import { renderMonthlyReportHtml } from '@/views/monthly-report.view';

const monthlyQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'se espera YYYY-MM')
    .optional(),
  format: z.enum(['json', 'html']).default('json'),
});

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/reports/monthly', async (request, reply) => {
    const parsed = monthlyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', issues: parsed.error.issues });
    }

    const month = parsed.data.month ?? currentMonth();
    const report = buildMonthlyReport(month);

    if (parsed.data.format === 'html') {
      return reply.type('text/html; charset=utf-8').send(renderMonthlyReportHtml(report));
    }

    return reply.send(report);
  });
}
