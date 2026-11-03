import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db } from '@/db/db';
import { ACTIVE_WORK_CATEGORY, UNCATEGORIZED } from '@/db/defaults';
import { statusMapping } from '@/db/schema';
import {
  deleteCategory,
  findCategory,
  listCategories,
  upsertCategory,
} from '@/repositories/config.repository';
import { configChanged, parseOrReply, sendError } from '@/routes/admin/shared';
import { categoryRoleSchema } from '@/services/config.service';

const COLOR_RE = /^#[0-9a-f]{6}$/i;

const categoryBodySchema = z.object({
  label: z.string().trim().min(1).max(60),
  color: z.string().regex(COLOR_RE),
  role: categoryRoleSchema,
  alert_after_seconds: z
    .number()
    .int()
    .min(60)
    .max(365 * 24 * 3600)
    .nullable(),
});

const createSchema = categoryBodySchema.extend({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,30}$/, 'usar minúsculas, números y guiones bajos')
    .refine((key) => key !== UNCATEGORIZED, 'clave reservada'),
});

const orderSchema = z.object({ keys: z.array(z.string()).min(1) });

function usageByCategory(): Map<string, number> {
  const rows = db
    .select({ category: statusMapping.category, count: sql<number>`count(*)` })
    .from(statusMapping)
    .groupBy(statusMapping.category)
    .all();
  return new Map(rows.map((row) => [row.category, row.count]));
}

export async function adminCategoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/categories', async (_request, reply) => {
    const usage = usageByCategory();
    return reply.send({
      categories: listCategories().map((row) => ({
        key: row.category,
        label: row.label,
        color: row.color,
        role: row.role,
        alert_after_seconds: row.alertAfterSeconds,
        order: row.position,
        mappings: usage.get(row.category) ?? 0,
        protected: row.category === ACTIVE_WORK_CATEGORY,
      })),
    });
  });

  app.post('/api/admin/categories', async (request, reply) => {
    const parsed = parseOrReply(createSchema, request.body, reply);
    if (!parsed.ok) return reply;
    if (findCategory(parsed.data.key)) {
      return sendError(reply, 409, 'category_exists', 'Ya existe una categoría con esa clave.');
    }

    const last = listCategories().at(-1);
    upsertCategory({
      category: parsed.data.key,
      label: parsed.data.label,
      color: parsed.data.color,
      role: parsed.data.role,
      alertAfterSeconds: parsed.data.alert_after_seconds,
      position: (last?.position ?? -1) + 1,
    });
    configChanged('categories');
    return reply.code(201).send({ ok: true });
  });

  app.put('/api/admin/categories/order', async (request, reply) => {
    const parsed = parseOrReply(orderSchema, request.body, reply);
    if (!parsed.ok) return reply;

    const current = listCategories();
    const known = new Set(current.map((row) => row.category));
    if (
      parsed.data.keys.length !== current.length ||
      !parsed.data.keys.every((key) => known.has(key))
    ) {
      return sendError(
        reply,
        400,
        'invalid_order',
        'El orden tiene que incluir todas las categorías.',
      );
    }

    db.transaction((tx) => {
      parsed.data.keys.forEach((key, index) => {
        const row = current.find((candidate) => candidate.category === key)!;
        upsertCategory({ ...row, position: index }, tx);
      });
    });
    configChanged('categories');
    return reply.send({ ok: true });
  });

  app.put<{ Params: { key: string } }>('/api/admin/categories/:key', async (request, reply) => {
    const parsed = parseOrReply(categoryBodySchema, request.body, reply);
    if (!parsed.ok) return reply;
    const existing = findCategory(request.params.key);
    if (!existing) return sendError(reply, 404, 'category_not_found', 'La categoría no existe.');

    upsertCategory({
      ...existing,
      label: parsed.data.label,
      color: parsed.data.color,
      role: parsed.data.role,
      alertAfterSeconds: parsed.data.alert_after_seconds,
    });
    configChanged('categories');
    return reply.send({ ok: true });
  });

  app.delete<{ Params: { key: string } }>('/api/admin/categories/:key', async (request, reply) => {
    const { key } = request.params;
    if (!findCategory(key)) {
      return sendError(reply, 404, 'category_not_found', 'La categoría no existe.');
    }
    if (key === ACTIVE_WORK_CATEGORY) {
      return sendError(
        reply,
        409,
        'category_protected',
        'Desarrollo se usa para el panel de trabajo actual y no se puede borrar.',
      );
    }
    const inUse = db.select().from(statusMapping).where(eq(statusMapping.category, key)).all();
    if (inUse.length > 0) {
      return sendError(
        reply,
        409,
        'category_in_use',
        `Hay ${inUse.length} estado(s) mapeados a esta categoría. Reasignalos antes de borrarla.`,
      );
    }

    deleteCategory(key);
    configChanged('categories');
    return reply.send({ ok: true });
  });
}
