import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { info, ok, warn, log, col } from '../lib/colors.js';

const SNIPPETS_FILE = path.join(os.homedir(), '.asyncat_snippets');

function loadSnippets() {
  try {
    return JSON.parse(fs.readFileSync(SNIPPETS_FILE, 'utf8'));
  } catch { return {}; }
}

function saveSnippets(snippets) {
  try {
    fs.writeFileSync(SNIPPETS_FILE, JSON.stringify(snippets, null, 2));
  } catch (e) {
    warn(`Failed to save snippets: ${e.message}`);
  }
}

export function run(args) {
  const sub = args[0];
  const snippets = loadSnippets();

  if (!sub || sub === 'list') {
    if (Object.keys(snippets).length === 0) { info('No snippets saved'); return; }
    log('');
    for (const [name, content] of Object.entries(snippets)) {
      const preview = content.split('\n')[0].substring(0, 50);
      log(`  ${col('cyan', name)}     ${col('dim', preview)}${content.split('\n').length > 1 ? '...' : ''}`);
    }
    log('');
    return;
  }

  if (sub === 'add' || sub === 'save') {
    const name = args[1];
    const content = args.slice(2).join(' ');
    if (!name || !content) { warn('Usage: snippets add <name> <content>'); return; }
    snippets[name] = content;
    saveSnippets(snippets);
    ok(`Saved snippet ${col('cyan', name)}`);
    return;
  }

  if (sub === 'show' || sub === 'view') {
    const name = args[1];
    if (!snippets[name]) { warn(`Snippet ${col('white', name)} not found`); return; }
    log('');
    log(`${col('cyan', name)}:`);
    log(col('dim', '─'.repeat(60)));
    log(snippets[name]);
    log(col('dim', '─'.repeat(60)));
    log('');
    return;
  }

  if (sub === 'rm' || sub === 'remove' || sub === 'delete') {
    const name = args[1];
    if (!name) { warn('Usage: snippets rm <name>'); return; }
    if (!snippets[name]) { warn(`Snippet ${col('white', name)} not found`); return; }
    delete snippets[name];
    saveSnippets(snippets);
    ok(`Removed snippet ${col('cyan', name)}`);
    return;
  }

  if (sub === 'copy') {
    const name = args[1];
    if (!snippets[name]) { warn(`Snippet ${col('white', name)} not found`); return; }
    try {
      const proc = spawn('xclip', ['-selection', 'clipboard']);
      proc.stdin.write(snippets[name]);
      proc.stdin.end();
      ok(`Copied ${col('cyan', name)} to clipboard`);
    } catch (e) {
      warn(`xclip not found — copy manually: ${snippets[name]}`);
    }
    return;
  }

  warn(`Unknown snippets subcommand: ${col('white', sub)}`);
}
