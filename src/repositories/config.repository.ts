import { asc, eq } from 'drizzle-orm';

import { type DbClient, db } from '@/db/db';
import { APP_SETTINGS_ID } from '@/db/defaults';
import {
  type AppSettingsRow,
  appSettings,
  type CategoryRow,
  categorySettings,
  type HolidayRow,
  holidays,
  type PersonRow,
  people,
} from '@/db/schema';

export function listCategories(client: DbClient = db): CategoryRow[] {
  return client.select().from(categorySettings).orderBy(asc(categorySettings.position)).all();
}

export function findCategory(key: string, client: DbClient = db): CategoryRow | undefined {
  return client.select().from(categorySettings).where(eq(categorySettings.category, key)).get();
}

export function upsertCategory(row: CategoryRow, client: DbClient = db): void {
  client
    .insert(categorySettings)
    .values(row)
    .onConflictDoUpdate({
      target: categorySettings.category,
      set: {
        label: row.label,
        color: row.color,
        role: row.role,
        alertAfterSeconds: row.alertAfterSeconds,
        position: row.position,
      },
    })
    .run();
}

export function deleteCategory(key: string, client: DbClient = db): void {
  client.delete(categorySettings).where(eq(categorySettings.category, key)).run();
}

export function readAppSettings(client: DbClient = db): AppSettingsRow | undefined {
  return client.select().from(appSettings).where(eq(appSettings.id, APP_SETTINGS_ID)).get();
}

export function writeAppSettings(
  row: Omit<AppSettingsRow, 'id' | 'updatedAt'>,
  client: DbClient = db,
): void {
  const values = { ...row, id: APP_SETTINGS_ID, updatedAt: new Date() };
  client
    .insert(appSettings)
    .values(values)
    .onConflictDoUpdate({ target: appSettings.id, set: values })
    .run();
}

export function listHolidays(client: DbClient = db): HolidayRow[] {
  return client.select().from(holidays).orderBy(asc(holidays.date)).all();
}

export function upsertHoliday(row: HolidayRow, client: DbClient = db): void {
  client
    .insert(holidays)
    .values(row)
    .onConflictDoUpdate({ target: holidays.date, set: { label: row.label } })
    .run();
}

export function deleteHoliday(date: string, client: DbClient = db): void {
  client.delete(holidays).where(eq(holidays.date, date)).run();
}

export function listPeople(client: DbClient = db): PersonRow[] {
  return client.select().from(people).all();
}

export function upsertPerson(row: PersonRow, client: DbClient = db): void {
  client
    .insert(people)
    .values(row)
    .onConflictDoUpdate({
      target: people.accountId,
      set: { alias: row.alias, hidden: row.hidden },
    })
    .run();
}
