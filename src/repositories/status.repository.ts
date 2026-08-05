import { db, type DbClient } from '@/db/db';
import { statusMapping, statuses, type StatusMappingRow } from '@/db/schema';

export interface UpsertStatusInput {
  statusId: string;
  projectKey: string;
  statusName: string;
  firstSeenAt: Date;
}

export function upsertStatus(input: UpsertStatusInput, client: DbClient = db): void {
  client
    .insert(statuses)
    .values(input)
    .onConflictDoUpdate({
      target: [statuses.statusId, statuses.projectKey],
      set: { statusName: input.statusName },
    })
    .run();
}

export function listStatusMappings(client: DbClient = db): StatusMappingRow[] {
  return client.select().from(statusMapping).all();
}

export const UNCATEGORIZED = 'uncategorized';

export function normalizeStatusName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

export class CategoryResolver {
  private readonly byId = new Map<string, string>();
  private readonly byName = new Map<string, string>();

  constructor(rows: StatusMappingRow[]) {
    for (const row of rows) {
      if (row.jiraStatusId) this.byId.set(row.jiraStatusId, row.category);
      if (row.jiraStatusName) this.byName.set(normalizeStatusName(row.jiraStatusName), row.category);
    }
  }

  resolve(statusId: string | null, statusName: string | null): string | null {
    if (statusId) {
      const byId = this.byId.get(statusId);
      if (byId) return byId;
    }
    return this.byName.get(normalizeStatusName(statusName)) ?? null;
  }
}

export function loadCategoryResolver(client: DbClient = db): CategoryResolver {
  return new CategoryResolver(listStatusMappings(client));
}
