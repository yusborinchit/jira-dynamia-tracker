import { z } from 'zod';

import {
  CATEGORY_ROLES,
  type CategoryRole,
  DEFAULT_WORK_SCHEDULE,
  UNCATEGORIZED,
  UNCATEGORIZED_COLOR,
  UNCATEGORIZED_LABEL,
  type WorkScheduleSetting,
} from '@/db/defaults';
import type { PersonRow } from '@/db/schema';
import {
  listCategories,
  listHolidays,
  listPeople,
  readAppSettings,
} from '@/repositories/config.repository';
import { type CategoryResolver, loadCategoryResolver } from '@/repositories/status.repository';
import { buildSchedule, type Schedule } from '@/utils/business-hours';

export interface CategoryConfig {
  key: string;
  label: string;
  color: string;
  role: CategoryRole;
  terminal: boolean;
  alert_after_seconds: number | null;
  order: number;
}

export interface AppConfig {
  categories: CategoryConfig[];
  categoryByKey: Map<string, CategoryConfig>;
  resolver: CategoryResolver;
  scheduleSetting: WorkScheduleSetting;
  schedule: Schedule;
  people: Map<string, PersonRow>;
}

const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const categoryRoleSchema = z.enum(CATEGORY_ROLES as [CategoryRole, ...CategoryRole[]]);

const workDaysSchema = z.array(z.number().int().min(0).max(6)).max(7);

const workShiftsSchema = z
  .array(z.object({ from: z.string().regex(CLOCK_RE), to: z.string().regex(CLOCK_RE) }))
  .min(1)
  .max(6)
  .refine(
    (shifts) =>
      shifts.every(
        (shift, index) =>
          shift.from < shift.to && (index === 0 || shifts[index - 1]!.to <= shift.from),
      ),
    { message: 'los turnos tienen que estar en orden y no pisarse' },
  );

export const workScheduleSchema = z.object({ days: workDaysSchema, shifts: workShiftsSchema });

let cached: AppConfig | null = null;

function parseJson<T>(raw: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

function readScheduleSetting(): WorkScheduleSetting {
  const row = readAppSettings();
  if (!row) return DEFAULT_WORK_SCHEDULE;
  return {
    days: parseJson(row.workDays, workDaysSchema, DEFAULT_WORK_SCHEDULE.days),
    shifts: parseJson(row.workShifts, workShiftsSchema, DEFAULT_WORK_SCHEDULE.shifts),
  };
}

function toRole(value: string): CategoryRole {
  return (CATEGORY_ROLES as readonly string[]).includes(value) ? (value as CategoryRole) : 'active';
}

function loadConfig(): AppConfig {
  const categories = listCategories().map((row) => {
    const role = toRole(row.role);
    return {
      key: row.category,
      label: row.label,
      color: row.color,
      role,
      terminal: role === 'terminal',
      alert_after_seconds: row.alertAfterSeconds,
      order: row.position,
    };
  });
  const scheduleSetting = readScheduleSetting();

  return {
    categories,
    categoryByKey: new Map(categories.map((category) => [category.key, category])),
    resolver: loadCategoryResolver(),
    scheduleSetting,
    schedule: buildSchedule(
      scheduleSetting,
      listHolidays().map((holiday) => holiday.date),
    ),
    people: new Map(listPeople().map((person) => [person.accountId, person])),
  };
}

export function getConfig(): AppConfig {
  cached ??= loadConfig();
  return cached;
}

export function invalidateConfig(): void {
  cached = null;
}

export function categoryColor(config: AppConfig, key: string | null): string {
  if (!key) return UNCATEGORIZED_COLOR;
  return config.categoryByKey.get(key)?.color ?? UNCATEGORIZED_COLOR;
}

export function isTerminal(config: AppConfig, key: string): boolean {
  return config.categoryByKey.get(key)?.terminal ?? false;
}

export function categoryList(config: AppConfig): CategoryConfig[] {
  return [
    ...config.categories,
    {
      key: UNCATEGORIZED,
      label: UNCATEGORIZED_LABEL,
      color: UNCATEGORIZED_COLOR,
      role: 'active',
      terminal: false,
      alert_after_seconds: null,
      order: Number.MAX_SAFE_INTEGER,
    },
  ];
}
