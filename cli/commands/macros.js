import fs from 'fs';
import path from 'path';
import os from 'os';
import { info, ok, warn, log, col } from '../lib/colors.js';

const MACROS_FILE = path.join(os.homedir(), '.asyncat_macros');

function loadMacros() {
  try {
    return JSON.parse(fs.readFileSync(MACROS_FILE, 'utf8'));
  } catch { return {}; }
}

function saveMacros(macros) {
  try {
    fs.writeFileSync(MACROS_FILE, JSON.stringify(macros, null, 2));
  } catch (e) {
    warn(`Failed to save macros: ${e.message}`);
  }
}

let recording = null;

export function run(args) {
  const sub = args[0];
  const macros = loadMacros();

  if (!sub || sub === 'list') {
    if (Object.keys(macros).length === 0) { info('No macros recorded'); return; }
    log('');
    for (const [name, cmds] of Object.entries(macros)) {
      log(`  ${col('cyan', name)}     ${cmds.length} command${cmds.length > 1 ? 's' : ''}`);
    }
    log('');
    return;
  }

  if (sub === 'record') {
    const name = args[1];
    if (!name) { warn('Usage: macros record <name>'); return; }
    if (recording) { warn(`Already recording macro ${col('white', recording.name)}`); return; }
    recording = { name, commands: [] };
    ok(`Recording macro ${col('cyan', name)} — type /macros stop to finish`);
    return;
  }

  if (sub === 'stop') {
    if (!recording) { warn('No macro being recorded'); return; }
    const macroName = recording.name;
    macros[macroName] = recording.commands;
    saveMacros(macros);
    ok(`Saved macro ${col('cyan', macroName)} with ${recording.commands.length} commands`);
    recording = null;
    return;
  }

  if (sub === 'play' || sub === 'run') {
    const name = args[1];
    if (!macros[name]) { warn(`Macro ${col('white', name)} not found`); return; }
    info(`Playing macro ${col('cyan', name)} (${macros[name].length} commands)...`);
    log('');
    // Return macro commands to be executed by dispatcher
    return { _macro: true, commands: macros[name] };
  }

  if (sub === 'show' || sub === 'view') {
    const name = args[1];
    if (!macros[name]) { warn(`Macro ${col('white', name)} not found`); return; }
    log('');
    log(`${col('cyan', name)}:`);
    for (let i = 0; i < macros[name].length; i++) {
      log(`  ${(i + 1).toString().padStart(2)}. ${col('dim', macros[name][i])}`);
    }
    log('');
    return;
  }

  if (sub === 'rm' || sub === 'remove' || sub === 'delete') {
    const name = args[1];
    if (!name) { warn('Usage: macros rm <name>'); return; }
    if (!macros[name]) { warn(`Macro ${col('white', name)} not found`); return; }
    delete macros[name];
    saveMacros(macros);
    ok(`Removed macro ${col('cyan', name)}`);
    return;
  }

  warn(`Unknown macros subcommand: ${col('white', sub)}`);
}

export function getRecording() {
  return recording;
}
