import 'dotenv/config';
import { eq } from 'drizzle-orm';

import { db, sqlite } from '@/db/db';
import { statusMapping } from '@/db/schema';
import { STATUS_MAPPING_ENTRIES } from '@/db/status-mapping.data';
import { normalizeStatusName } from '@/repositories/status.repository';

function loadStatusMapping(): void {
  const existing = db.select().from(statusMapping).all();
  const byName = new Map(
    existing
      .filter((row) => row.jiraStatusName)
      .map((row) => [normalizeStatusName(row.jiraStatusName), row]),
  );

  let inserted = 0;
  let updated = 0;

  db.transaction((tx) => {
    for (const entry of STATUS_MAPPING_ENTRIES) {
      const current = byName.get(normalizeStatusName(entry.statusName));

      if (!current) {
        tx.insert(statusMapping)
          .values({ jiraStatusId: null, jiraStatusName: entry.statusName, category: entry.category })
          .run();
        inserted += 1;
        continue;
      }

      if (current.category !== entry.category) {
        tx.update(statusMapping)
          .set({ category: entry.category })
          .where(eq(statusMapping.id, current.id))
          .run();
        updated += 1;
      }
    }
  });

  console.log(
    `status_mapping: ${inserted} nuevos, ${updated} actualizados, ${STATUS_MAPPING_ENTRIES.length} estados en total`,
  );
  sqlite.close();
}

loadStatusMapping();
