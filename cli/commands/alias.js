import fs from 'fs';
import path from 'path';
import os from 'os';
import { info, ok, warn, log, col } from '../lib/colors.js';

const ALIAS_FILE = path.join(os.homedir(), '.asyncat_aliases');

function loadAliases() {
  try {
    return JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8'));
  } catch { return {}; }
}

function saveAliases(aliases) {
  try {
    fs.writeFileSync(ALIAS_FILE, JSON.stringify(aliases, null, 2));
  } catch (e) {
    warn(`Failed to save aliases: ${e.message}`);
  }
}

export function run(args) {
  const sub = args[0];
  const aliases = loadAliases();

  if (!sub || sub === 'list') {
    if (Object.keys(aliases).length === 0) { info('No aliases defined'); return; }
    log('');
    for (const [name, cmd] of Object.entries(aliases)) {
      log(`  ${col('cyan', name)}     ${col('dim', cmd)}`);
    }
    log('');
    return;
  }

  if (sub === 'add' || sub === 'set') {
    const name = args[1];
    const cmd = args.slice(2).join(' ');
    if (!name || !cmd) { warn('Usage: alias add <name> <command>'); return; }
    aliases[name] = cmd;
    saveAliases(aliases);
    ok(`Alias ${col('cyan', name)} → ${col('dim', cmd)}`);
    return;
  }

  if (sub === 'rm' || sub === 'remove' || sub === 'delete') {
    const name = args[1];
    if (!name) { warn('Usage: alias rm <name>'); return; }
    if (!aliases[name]) { warn(`Alias ${col('white', name)} not found`); return; }
    delete aliases[name];
    saveAliases(aliases);
    ok(`Removed alias ${col('cyan', name)}`);
    return;
  }

  if (sub === 'expand') {
    const name = args[1];
    if (!aliases[name]) { warn(`Alias ${col('white', name)} not found`); return; }
    info(`${col('cyan', name)} → ${aliases[name]}`);
    return;
  }

  warn(`Unknown alias subcommand: ${col('white', sub)}`);
}

export function getAlias(name) {
  return loadAliases()[name];
}
