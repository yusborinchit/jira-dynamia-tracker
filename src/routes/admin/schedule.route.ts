import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db } from '@/db/db';
import {
  deleteHoliday,
  listHolidays,
  upsertHoliday,
  writeAppSettings,
} from '@/repositories/config.repository';
import { configChanged, parseOrReply } from '@/routes/admin/shared';
import { getConfig, workScheduleSchema } from '@/services/config.service';
import { uruguayHolidays } from '@/utils/holidays';
import { REPORT_TIMEZONE } from '@/utils/time';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const holidaySchema = z.object({
  date: z.string().regex(DATE_RE),
  label: z.string().trim().min(1).max(100),
});

const presetSchema = z.object({ year: z.number().int().min(2000).max(2100) });

export async function adminScheduleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/schedule', async (_request, reply) => {
    return reply.send({
      timezone: REPORT_TIMEZONE,
      schedule: getConfig().scheduleSetting,
      holidays: listHolidays(),
    });
  });

  app.put('/api/admin/schedule', async (request, reply) => {
    const parsed = parseOrReply(workScheduleSchema, request.body, reply);
    if (!parsed.ok) return reply;

    writeAppSettings({
      timezone: REPORT_TIMEZONE,
      workDays: JSON.stringify([...new Set(parsed.data.days)].sort((a, b) => a - b)),
      workShifts: JSON.stringify(parsed.data.shifts),
    });
    configChanged('schedule');
    return reply.send({ ok: true });
  });

  app.post('/api/admin/holidays', async (request, reply) => {
    const parsed = parseOrReply(holidaySchema, request.body, reply);
    if (!parsed.ok) return reply;
    upsertHoliday(parsed.data);
    configChanged('schedule');
    return reply.code(201).send({ ok: true });
  });

  app.post('/api/admin/holidays/uruguay', async (request, reply) => {
    const parsed = parseOrReply(presetSchema, request.body, reply);
    if (!parsed.ok) return reply;

    const existing = new Set(listHolidays().map((holiday) => holiday.date));
    const missing = uruguayHolidays(parsed.data.year).filter(
      (holiday) => !existing.has(holiday.date),
    );
    db.transaction((tx) => {
      for (const holiday of missing) upsertHoliday(holiday, tx);
    });
    configChanged('schedule');
    return reply.send({ inserted: missing.length });
  });

  app.delete<{ Params: { date: string } }>('/api/admin/holidays/:date', async (request, reply) => {
    deleteHoliday(request.params.date);
    configChanged('schedule');
    return reply.send({ ok: true });
  });
}
