// cli/commands/permissions.js
// ─── Manage persistent tool-permission rules ─────────────────────────────────
//   asyncat permissions            # list rules
//   asyncat permissions list       # list rules
//   asyncat permissions allow <tool> [--match-field F --match-pattern RE] [--global] [--note "..."]
//   asyncat permissions deny <tool> [--match-field F --match-pattern RE] [--global] [--note "..."]
//   asyncat permissions rm <id>    # remove rule by id
//   asyncat permissions clear      # remove all rules

import { col, log, ok, warn } from '../lib/colors.js';
import { getToken, getBase, apiGet, apiPost, apiDelete } from '../lib/denApi.js';

async function ensureBackend() {
  try {
    const token = await getToken();
    const base = getBase();
    return { token, base };
  } catch (e) {
    warn(`  ${e.message}`);
    warn(`  Run ${col('cyan', 'asyncat start')} first.`);
    return null;
  }
}

async function listRules() {
  const ctx = await ensureBackend();
  if (!ctx) return;

  const res = await apiGet('/api/agent/permissions/rules');
  if (!res?.success) {
    warn('  Failed to fetch rules');
    return;
  }
  const rules = res.rules || [];
  if (rules.length === 0) {
    log(`  ${col('dim', 'No saved permission rules.')}`);
    return;
  }

  log('');
  for (const r of rules) {
    const icon = r.action === 'deny' ? col('red', '✘') : col('green', '✔');
    const scope = r.scope === 'global' ? col('magenta', 'global') : col('cyan', 'workspace');
    const pattern = r.arg_pattern
      ? col('dim', ` where ${r.arg_field || 'args'} ~= /${r.arg_pattern}/`)
      : '';
    log(`  ${icon} ${col('bold', r.tool_name)}${pattern}   ${scope}`);
    log(`    ${col('dim', `id=${r.id.slice(0, 8)}…  added ${r.created_at}`)}`);
    if (r.note) log(`    ${col('dim', `note: ${r.note}`)}`);
    log('');
  }
}

async function addRule(action, args) {
  const ctx = await ensureBackend();
  if (!ctx) return;

  const tool = args.find(a => !a.startsWith('-'));
  if (!tool) {
    warn('  Usage: asyncat permissions allow <tool_name> [--match-field F --match-pattern RE] [--global]');
    return;
  }

  const matchFieldIdx = args.indexOf('--match-field');
  const matchPatternIdx = args.indexOf('--match-pattern');
  const noteIdx = args.indexOf('--note');
  const isGlobal = args.includes('--global');

  const body = {
    toolName: tool,
    action,
    scope: isGlobal ? 'global' : 'workspace',
    argField: matchFieldIdx >= 0 ? args[matchFieldIdx + 1] : null,
    argPattern: matchPatternIdx >= 0 ? args[matchPatternIdx + 1] : null,
    note: noteIdx >= 0 ? args[noteIdx + 1] : null,
  };

  const res = await apiPost('/api/agent/permissions/rules', body);
  if (res?.success) ok(`  ${action === 'allow' ? 'Allowed' : 'Denied'} ${tool} (rule id: ${res.id.slice(0, 8)}…)`);
  else warn(`  Failed: ${res?.error || 'unknown error'}`);
}

async function removeRule(id) {
  const ctx = await ensureBackend();
  if (!ctx) return;

  if (!id) {
    warn('  Usage: asyncat permissions rm <ruleId>');
    return;
  }

  try {
    const data = await apiDelete(`/api/agent/permissions/rules/${encodeURIComponent(id)}`);
    if (data?.success) ok(`  Removed rule ${id}`);
    else warn(`  Failed: ${data?.error || 'unknown error'}`);
  } catch (err) {
    warn(`  Failed: ${err.message}`);
  }
}

async function clearRules() {
  const ctx = await ensureBackend();
  if (!ctx) return;

  const res = await apiGet('/api/agent/permissions/rules');
  const rules = res?.rules || [];
  if (rules.length === 0) {
    log(`  ${col('dim', 'Nothing to clear.')}`);
    return;
  }

  let removed = 0;
  for (const r of rules) {
    try {
      const data = await apiDelete(`/api/agent/permissions/rules/${encodeURIComponent(r.id)}`);
      if (data?.success) removed++;
    } catch { /* skip */ }
  }
  ok(`  Removed ${removed} rule${removed === 1 ? '' : 's'}`);
}

export async function run(args = []) {
  const sub = (args[0] || 'list').toLowerCase();
  const rest = args.slice(1);

  switch (sub) {
    case 'list':
    case 'ls':
      await listRules();
      break;
    case 'allow':
      await addRule('allow', rest);
      break;
    case 'deny':
      await addRule('deny', rest);
      break;
    case 'rm':
    case 'remove':
    case 'delete':
      await removeRule(rest[0]);
      break;
    case 'clear':
      await clearRules();
      break;
    case 'help':
    case '?':
      log('');
      log(`  ${col('bold', 'asyncat permissions')} — manage saved tool-permission rules`);
      log('');
      log(`    list                              list all rules`);
      log(`    allow <tool> [--match-field F --match-pattern RE] [--global] [--note "…"]`);
      log(`    deny  <tool> [--match-field F --match-pattern RE] [--global] [--note "…"]`);
      log(`    rm <ruleId>                       remove a rule`);
      log(`    clear                             remove all rules`);
      log('');
      log(`  ${col('dim', 'Example: asyncat permissions allow run_command --match-field command --match-pattern "^git "')}`);
      log('');
      break;
    default:
      warn(`  Unknown subcommand: ${sub}`);
      log(`  Try ${col('cyan', 'asyncat permissions help')}`);
  }
}
