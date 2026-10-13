// den/src/boot/applyPendingReset.js
// Imported first by index.js (right after .env is read): if "Delete
// everything" was asked for, do it now, before the database and log files
// are opened.

import path from 'path';
import { runtimeDataRoot, runtimeHome } from '../config/runtimeConfig.js';
import { applyReset } from '../privacy/resetData.js';

const result = applyReset({
  dataRoot: runtimeDataRoot(),
  home: runtimeHome(),
  dbPath: process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : null,
  storagePath: process.env.STORAGE_PATH || null,
  logDir: process.env.ASYNCAT_LOG_DIR || null,
});
if (result) {
  console.log(`[privacy] Deleted everything as asked: ${result.removed.length} items${result.includeModels ? ', models and engines included' : ''}.`);
}
