import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// Tables nothing reads any more are dropped when an older database opens:
// agent_patterns kept summaries of earlier chats' goals for the workflow
// tracker that wrote auto-* skills.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-retired-tables-'));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');

const older = new Database(process.env.DB_PATH);
older.exec(`
  CREATE TABLE agent_patterns (id TEXT PRIMARY KEY, pattern_summary TEXT NOT NULL);
  INSERT INTO agent_patterns VALUES ('p1', 'Summarise the fruit notes');
`);
older.close();

const { default: db } = await import('../src/db/client.js');

test.after(() => {
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

test('an older database loses the workflow pattern table', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  assert.equal(tables.includes('agent_patterns'), false);
  assert.ok(tables.includes('agent_memory'), 'the rest of the schema is in place');
});
