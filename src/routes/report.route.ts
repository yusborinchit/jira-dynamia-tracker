import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { buildMonthlyReport, buildReport } from '@/services/report.service';
import { currentDate, currentMonth, dayRange, monthRangeForDate, type Range } from '@/utils/time';

const monthlyQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM')
    .optional(),
});

const rangeQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'expected YYYY-MM-DD')
    .optional(),
  span: z.enum(['day', 'month']).default('month'),
});

const RANGE_BUILDERS: Record<'day' | 'month', (date: string) => Range> = {
  day: dayRange,
  month: monthRangeForDate,
};

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/reports/monthly', async (request, reply) => {
    const parsed = monthlyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', issues: parsed.error.issues });
    }

    const month = parsed.data.month ?? currentMonth();

    return reply.send(buildMonthlyReport(month));
  });

  app.get('/reports/range', async (request, reply) => {
    const parsed = rangeQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', issues: parsed.error.issues });
    }

    const date = parsed.data.date ?? currentDate();
    const range = RANGE_BUILDERS[parsed.data.span](date);

    return reply.send({ span: parsed.data.span, date, ...buildReport(range) });
  });
}
