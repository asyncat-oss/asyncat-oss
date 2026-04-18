import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { ROOT, readEnv } from '../lib/env.js';
import { log, ok, warn, info, err, col } from '../lib/colors.js';

const MODELS_DIR = path.join(ROOT, 'den/data/models');

function humanSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

function getModels() {
  if (!fs.existsSync(MODELS_DIR)) return [];
  return fs.readdirSync(MODELS_DIR)
    .filter(f => f.endsWith('.gguf'))
    .map(f => {
      const full = path.join(MODELS_DIR, f);
      const stat = fs.statSync(full);
      return { name: f, size: stat.size, path: full };
    });
}

function getActiveModel() {
  const env = readEnv('den/.env');
  const raw = env['LOCAL_MODEL_PATH'] || '';
  return raw ? path.basename(raw) : null;
}

function prompt(question) {
  return new Promise(resolve => {
    const tmp = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(question);
    tmp.once('line', ans => { tmp.close(); resolve(ans.trim()); });
  });
}

function listModels() {
  const models = getModels();
  const active = getActiveModel();

  log('');
  if (models.length === 0) {
    warn(`No .gguf models found in ${col('dim', 'den/data/models/')}`);
    info(`Place model files (*.gguf) in ${col('white', 'den/data/models/')}`);
    log('');
    return;
  }

  log(`  ${col('bold', 'Models')} ${col('dim', '(' + MODELS_DIR + ')')}`);
  log('');
  for (const m of models) {
    const isActive = active && m.name === active;
    const marker   = isActive ? col('green', '▸ ') : '  ';
    const nameStr  = isActive ? col('green', col('bold', m.name)) : col('white', m.name);
    const sizeStr  = col('dim', humanSize(m.size));
    const tag      = isActive ? col('green', ' (active)') : '';
    log(`  ${marker}${nameStr}  ${sizeStr}${tag}`);
  }
  log('');
  if (!active) info(`Set ${col('white', 'LOCAL_MODEL_PATH')} in den/.env to activate a model.`);
}

async function removeModel(name) {
  if (!name) { warn('Usage: models remove <filename>'); return; }
  const models = getModels();
  const found = models.find(m => m.name === name || m.name === name + '.gguf');
  if (!found) { err(`Model not found: ${col('white', name)}`); return; }

  log('');
  warn(`This will permanently delete: ${col('white', found.name)} (${humanSize(found.size)})`);
  const ans = await prompt(`  ${col('yellow', 'Confirm delete?')} [y/N]: `);
  if (ans.toLowerCase() !== 'y') { info('Cancelled.'); return; }

  try {
    fs.unlinkSync(found.path);
    ok(`Deleted ${found.name}`);
  } catch (e) {
    err(`Failed to delete: ${e.message}`);
  }
}

export async function run(args) {
  const sub = (args && args[0]) || 'list';

  if (sub === 'list') {
    listModels();
  } else if (sub === 'remove' || sub === 'rm') {
    await removeModel(args[1]);
  } else {
    warn(`Unknown models subcommand: ${col('white', sub)}`);
    log(`  Usage: ${col('cyan', 'models')} ${col('dim', '[list|remove <name>]')}`);
  }
}
