import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { buildMonthlyReport } from '@/services/report.service';
import { currentMonth } from '@/utils/time';

const monthlyQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'se espera YYYY-MM')
    .optional(),
});

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/reports/monthly', async (request, reply) => {
    const parsed = monthlyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', issues: parsed.error.issues });
    }

    const month = parsed.data.month ?? currentMonth();
    return reply.send(buildMonthlyReport(month));
  });
}
