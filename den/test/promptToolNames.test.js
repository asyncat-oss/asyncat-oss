import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// The system prompt, the bundled skills and the souls tell the model which
// tools to call. A tool that was renamed or removed but is still named there
// sends the model to a tool that doesn't exist (the prompt kept naming the
// scheduled-task tools after Cats replaced them).

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-promptnames-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');

const { default: db } = await import('../src/db/client.js');
const { initializeAgent } = await import('../src/agent/index.js');
const { toolRegistry } = await import('../src/agent/tools/toolRegistry.js');
const { buildAgentSystemPrompt } = await import('../src/agent/prompts/agentSystemPrompt.js');
const { BUNDLED_SKILLS_DIR } = await import('../src/agent/skills.js');

await initializeAgent();

test.after(() => {
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

const SOULS_DIR = path.join(path.dirname(BUNDLED_SKILLS_DIR), 'souls');
const SNAKE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

const tools = toolRegistry.all();
const toolNames = new Set(tools.map((tool) => tool.name));
const paramNames = new Set(tools.flatMap((tool) => Object.keys(tool.parameters?.properties || {})));
// Tool names start with a verb or area ("create_", "list_", "git_"); a
// snake_case word that starts the same way reads as a tool to the model.
const toolPrefixes = new Set(tools.map((tool) => tool.name.split('_')[0]));

/**
 * Names in a text that refer to a tool: the Plan mode tool lists, the "name"
 * of example tool calls (next to "arguments"), and `backticked` snake_case words that start like a
 * tool name and aren't a parameter. Words after "NOT" on a line are examples
 * of what not to write (wrong argument names), so they don't count.
 */
function toolMentions(text) {
  const found = new Set();
  for (const line of text.split('\n')) {
    const list = line.match(/\*\*(?:NOT )?[Aa]llowed:\*\*(.*)$/);
    if (list) {
      for (const name of list[1].match(SNAKE) || []) found.add(name);
      continue;
    }
    for (const match of line.matchAll(/"name":\s*"([a-z0-9_]+)",\s*"arguments"/g)) {
      if (match[1] !== 'tool_name') found.add(match[1]); // the format's placeholder
    }
    const said = line.split(/\bNOT\b/)[0];
    for (const match of said.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g)) {
      const name = match[1];
      if (!paramNames.has(name) && toolPrefixes.has(name.split('_')[0])) found.add(name);
    }
  }
  return [...found];
}

function unknownTools(text) {
  return toolMentions(text).filter((name) => !toolNames.has(name)).sort();
}

// Old names of merged tools still work (tools/toolAliases.js), but the prompt
// and skills should teach the current ones, wherever the name appears.
const oldToolNames = toolRegistry.aliases().map(({ name }) => name);
function oldNames(text) {
  return oldToolNames.filter((name) => new RegExp(`\\b${name}\\b`).test(text)).sort();
}

const markdownIn = (dir) => fs.readdirSync(dir)
  .filter((file) => file.endsWith('.md'))
  .map((file) => [file, fs.readFileSync(path.join(dir, file), 'utf8')]);

test('the tool mention finder catches a removed tool and leaves arguments alone', () => {
  assert.deepEqual(unknownTools('use `create_scheduled_task` with a prompt'), ['create_scheduled_task']);
  assert.deepEqual(unknownTools('- **Allowed:** read_file, list_scheduled_tasks, run_command (read-only only)'), ['list_scheduled_tasks']);
  assert.deepEqual(unknownTools('{"name": "list_scheduled_task_runs", "arguments": {}}'), ['list_scheduled_task_runs']);
  assert.deepEqual(unknownTools('`edit_file` requires `old_string` and `new_string`'), []);
  assert.ok(oldToolNames.includes('patch_file'), 'merged tools keep their old names as aliases');
  assert.deepEqual(oldNames('4. patch_file / edit_file → make the change'), ['patch_file']);
  assert.deepEqual(unknownTools('`run_command` requires `command` — NOT `cmd`, `exec`, or `shell_command`'), []);
});

test('the system prompt only names registered tools, in every mode', () => {
  for (const agentMode of ['action', 'plan', 'design']) {
    const prompt = buildAgentSystemPrompt({ agentMode, goal: 'remind me every morning' });
    assert.deepEqual(unknownTools(prompt), [], `${agentMode} mode names tools that don't exist`);
    assert.deepEqual(oldNames(prompt), [], `${agentMode} mode names tools by their old names`);
  }
});

test('the prompt sends later and repeated work to Cats', () => {
  const prompt = buildAgentSystemPrompt({ agentMode: 'action' });
  assert.match(prompt, /`create_cat`/);
  assert.doesNotMatch(prompt, /scheduled task/i);
  const plan = buildAgentSystemPrompt({ agentMode: 'plan' });
  const allowed = plan.split('\n').find((line) => line.includes('**Allowed:**'));
  for (const name of ['list_cats', 'list_cat_runs']) assert.ok(allowed.includes(name), `Plan mode should allow ${name}`);
  // run_command is let through in Plan mode for read-only commands only.
  for (const name of toolMentions(allowed).filter((tool) => tool !== 'run_command')) {
    assert.equal(toolRegistry.get(name)?.permission, 'safe', `${name} is allowed in Plan mode but changes things`);
  }
});

test('bundled skills and souls only name registered tools', () => {
  for (const [file, text] of [...markdownIn(BUNDLED_SKILLS_DIR), ...markdownIn(SOULS_DIR)]) {
    assert.deepEqual(unknownTools(text), [], `${file} names tools that don't exist`);
    assert.deepEqual(oldNames(text), [], `${file} names tools by their old names`);
  }
});
