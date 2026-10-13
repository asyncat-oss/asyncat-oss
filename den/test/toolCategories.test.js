import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// The task-based tool lists name tool categories; a name no tool has
// silently leaves those tools out (design mode once never got todo_write).

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-categories-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');

const { default: db } = await import('../src/db/client.js');
const { initializeAgent } = await import('../src/agent/index.js');
const { toolRegistry } = await import('../src/agent/tools/toolRegistry.js');
const { TOOL_CATEGORY_PRIORITY, DESIGN_ALLOWED_CATEGORIES } = await import('../src/agent/AgentRuntime.js');

await initializeAgent();

test.after(() => {
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

test('every category the agent prefers or allows is a real tool category', () => {
  const real = new Set(toolRegistry.all().map((tool) => tool.category));
  for (const [task, categories] of Object.entries(TOOL_CATEGORY_PRIORITY)) {
    for (const category of categories) assert.ok(real.has(category), `${task}: "${category}" is not a tool category`);
  }
  for (const category of DESIGN_ALLOWED_CATEGORIES) assert.ok(real.has(category), `design: "${category}" is not a tool category`);
});
