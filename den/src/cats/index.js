// den/src/cats/index.js
// Starts the Cats: moves old schedules, workflows and scheduled tasks over
// (once), then starts the clock that wakes them.

import { startCatEngine, stopCatEngine } from './catEngine.js';
import { runCat } from './catRunner.js';
import { migrateScheduledTasksToCats } from './catMigration.js';
import { migrateLegacyData } from '../agent/Scheduler.js';

export function startCats() {
  startCatEngine({
    runCat,
    migrate: () => {
      const legacy = migrateLegacyData();
      if (legacy.jobs || legacy.workflows) {
        console.log(`[cats] Moved ${legacy.jobs} old schedule(s) and ${legacy.workflows} workflow(s) to scheduled tasks`);
      }
      const moved = migrateScheduledTasksToCats();
      if (moved.cats) console.log(`[cats] Turned ${moved.cats} scheduled task(s) into Cats`);
    },
  });
}

export { stopCatEngine };
