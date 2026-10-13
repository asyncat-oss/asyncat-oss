// localModelRestore.js — reload the built-in model that was in use last time.
//
// llama-server runs as a child of the backend, so it stops whenever Asyncat
// quits. Without this, the saved choice still points at the model but nothing
// answers until it is loaded again by hand. Set ASYNCAT_RESTORE_LOCAL_MODEL=false
// to skip it (for example on machines short on memory).

import fs from 'fs';
import path from 'path';
import db from '../../../db/client.js';
import { getStatus as getLlamaStatus, startServer } from './llamaServerManager.js';
import { MODELS_DIR } from './modelManager.js';
import { LLAMA_PROVIDER_ID, parseSettings } from './providerCatalog.js';

const DEFAULT_RESTORE_CTX = 8192;

export async function restoreLocalModel(logger = console) {
  if (process.env.ASYNCAT_RESTORE_LOCAL_MODEL === 'false') return;
  try {
    const row = db
      .prepare('SELECT model, settings FROM ai_provider_config WHERE provider_id = ? ORDER BY updated_at DESC LIMIT 1')
      .get(LLAMA_PROVIDER_ID);
    if (!row?.model) return;

    const modelPath = path.isAbsolute(row.model) ? row.model : path.join(MODELS_DIR, path.basename(row.model));
    if (!fs.existsSync(modelPath)) return;
    if (getLlamaStatus().status !== 'idle') return;

    const ctxSize = Number(parseSettings(row.settings).ctx_size) || DEFAULT_RESTORE_CTX;
    await startServer(modelPath, MODELS_DIR, ctxSize);
    logger.info(`Local model: reloading ${path.basename(modelPath)} (${ctxSize.toLocaleString()} ctx)`);
  } catch (err) {
    logger.warn(`Local model: could not reload the last model: ${err.message}`);
  }
}
