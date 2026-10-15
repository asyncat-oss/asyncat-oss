import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Notes an agent makes stay calm: no gradient banner, and no first heading
// that only repeats the title shown above the blocks.

const { default: db } = await import('../src/db/client.js');
const { createNoteTool, updateNoteTool } = await import('../src/agent/tools/noteTools.js');

const userId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);

const metaOf = (id) => JSON.parse(db.prepare('SELECT metadata FROM notes WHERE id = ?').get(id).metadata || '{}');

test('a gradient banner and a heading that repeats the title are left out', async () => {
  const result = await createNoteTool.execute({
    title: 'Bakery launch plan',
    banner: { type: 'gradient', gradient: 'linear-gradient(45deg,#667eea,#764ba2)' },
    blocks: [
      { type: 'heading1', content: 'Bakery launch plan' },
      { type: 'text', content: 'Open on Saturday.' },
    ],
  }, { userId });
  assert.equal(result.success, true, result.error);
  const meta = metaOf(result.artifact.noteId);
  assert.equal(meta.banner, undefined);
  assert.deepEqual(meta.blocks.map((block) => block.type), ['text']);
});

test('a plain colour banner the user asked for is kept, and a gradient never replaces it', async () => {
  const made = await createNoteTool.execute({ title: 'Garden', banner: { type: 'color', color: '#e5e7eb' }, blocks: [{ type: 'text', content: 'Water.' }] }, { userId });
  const id = made.artifact.noteId;
  assert.equal(metaOf(id).banner.color, '#e5e7eb');
  await updateNoteTool.execute({ note_id: id, banner: { type: 'gradient', gradient: 'linear-gradient(red, blue)' } }, { userId });
  assert.equal(metaOf(id).banner.color, '#e5e7eb');
  await updateNoteTool.execute({ note_id: id, banner: null }, { userId });
  assert.equal(metaOf(id).banner, undefined);
});
