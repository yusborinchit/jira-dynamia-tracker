import 'dotenv/config';

import { db, sqlite } from '@/db/db';
import { APP_SETTINGS_ID, DEFAULT_CATEGORIES, DEFAULT_WORK_SCHEDULE } from '@/db/defaults';
import { appSettings, categorySettings, statusMapping } from '@/db/schema';
import { normalizeStatusName } from '@/repositories/status.repository';
import { REPORT_TIMEZONE } from '@/utils/time';

function seed(): void {
  const existingCategories = new Set(
    db
      .select()
      .from(categorySettings)
      .all()
      .map((row) => row.category),
  );
  const existingNames = new Set(
    db
      .select()
      .from(statusMapping)
      .all()
      .filter((row) => row.jiraStatusName)
      .map((row) => normalizeStatusName(row.jiraStatusName)),
  );

  let categoriesInserted = 0;
  let mappingsInserted = 0;
  let scheduleInserted = false;

  db.transaction((tx) => {
    DEFAULT_CATEGORIES.forEach((category, index) => {
      if (existingCategories.has(category.key)) return;
      tx.insert(categorySettings)
        .values({
          category: category.key,
          label: category.label,
          color: category.color,
          role: category.role,
          alertAfterSeconds: category.alertAfterSeconds,
          position: existingCategories.size + index,
        })
        .run();
      categoriesInserted += 1;
    });

    for (const category of DEFAULT_CATEGORIES) {
      for (const statusName of category.statuses) {
        if (existingNames.has(normalizeStatusName(statusName))) continue;
        tx.insert(statusMapping)
          .values({ jiraStatusId: null, jiraStatusName: statusName, category: category.key })
          .run();
        mappingsInserted += 1;
      }
    }

    const inserted = tx
      .insert(appSettings)
      .values({
        id: APP_SETTINGS_ID,
        timezone: REPORT_TIMEZONE,
        workDays: JSON.stringify(DEFAULT_WORK_SCHEDULE.days),
        workShifts: JSON.stringify(DEFAULT_WORK_SCHEDULE.shifts),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .run();
    scheduleInserted = inserted.changes > 0;
  });

  console.log(
    `seed: ${categoriesInserted} categories, ${mappingsInserted} status mappings${
      scheduleInserted ? ', default work schedule' : ''
    } inserted; existing rows left untouched`,
  );
  sqlite.close();
}

seed();
