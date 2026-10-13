import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import JSZip from 'jszip';

// Projects carry instructions and knowledge files into every chat, sized to
// the model: everything when it fits, the most relevant passages when not.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-knowledge-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');

const { default: db } = await import('../src/db/client.js');
const { seed } = await import('../src/db/seed.js');
const store = await import('../src/knowledge/knowledgeStore.js');
const { buildKnowledgeContext, knowledgeFitReport } = await import('../src/knowledge/contextBuilder.js');
const { projectForChat, buildChatContext } = await import('../src/knowledge/chatContext.js');
const { default: projectRouter } = await import('../src/users/routes/projectRouters.js');

await seed();
const user = db.prepare('SELECT id FROM users LIMIT 1').get();
const workspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get();

function makeProject(name = 'Garden planner', instructions = '') {
  const id = randomUUID();
  db.prepare(`INSERT INTO projects (id, name, created_by, owner_id, team_id, instructions) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, name, user.id, user.id, workspace.id, instructions);
  return id;
}

test.after(() => {
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
  + '1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a6bb0000000049454e44ae426082', 'hex');

test('text, Word and image files are stored; unreadable ones are refused clearly', async () => {
  const projectId = makeProject();
  const md = await store.addKnowledgeFile({
    ownerType: 'project', ownerId: projectId, userId: user.id, fileName: 'tomatoes.md',
    buffer: Buffer.from('# Tomatoes\n\nWater tomatoes deeply twice a week. Stake them when they reach 30 cm.'),
  });
  assert.equal(md.kind, 'text');
  assert.ok(md.token_estimate > 0);

  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Basil likes full sun &amp; warm soil.</w:t></w:r></w:p></w:body></w:document>');
  const docx = await store.addKnowledgeFile({
    ownerType: 'project', ownerId: projectId, userId: user.id, fileName: 'herbs.docx', buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  });
  assert.equal(docx.kind, 'document');

  const image = await store.addKnowledgeFile({ ownerType: 'project', ownerId: projectId, userId: user.id, fileName: 'plot.png', buffer: PNG });
  assert.equal(image.kind, 'image');

  await assert.rejects(
    store.addKnowledgeFile({ ownerType: 'project', ownerId: projectId, userId: user.id, fileName: 'app.exe', buffer: Buffer.from([0, 1, 2]) }),
    /can’t be read yet/,
  );
  assert.equal(store.listKnowledgeFiles('project', projectId).length, 3);
  assert.match(store.knowledgeTexts('project', projectId).find((f) => f.name === 'herbs.docx').text, /Basil likes full sun & warm soil/);
});

test('everything goes in when it fits, excerpts and a search hint when it does not', async () => {
  const projectId = makeProject('Recipes', 'Answer in metric units.');
  await store.addKnowledgeFile({ ownerType: 'project', ownerId: projectId, userId: user.id, fileName: 'soup.md', buffer: Buffer.from('Lentil soup needs 200 g red lentils and one onion.') });
  const filler = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} about bread baking, flour hydration and oven temperature.`).join('\n\n');
  await store.addKnowledgeFile({ ownerType: 'project', ownerId: projectId, userId: user.id, fileName: 'bread.md', buffer: Buffer.from(filler) });
  const sources = [{ type: 'project', id: projectId, label: 'project “Recipes”', instructions: 'Answer in metric units.' }];

  const roomy = buildKnowledgeContext({ sources, query: 'lentil soup', contextWindow: 200000 });
  assert.equal(roomy.stats.mode, 'full');
  assert.match(roomy.prompt, /Answer in metric units/);
  assert.match(roomy.prompt, /<knowledge_file name="soup.md">/);

  const tight = buildKnowledgeContext({ sources, query: 'how many lentils for the soup', contextWindow: 8192 });
  assert.equal(tight.stats.mode, 'search');
  assert.match(tight.prompt, /knowledge_search tool/);
  assert.match(tight.prompt, /200 g red lentils/, 'the relevant passage is included');
  assert.ok(tight.stats.includedTokens < tight.stats.knowledgeTokens);
});

test('images go to models that can see them and are only named for others', async () => {
  const projectId = makeProject('Photos');
  await store.addKnowledgeFile({ ownerType: 'project', ownerId: projectId, userId: user.id, fileName: 'leaf.png', buffer: PNG });
  const sources = [{ type: 'project', id: projectId, label: 'project “Photos”' }];
  const seeing = buildKnowledgeContext({ sources, contextWindow: 128000, supportsImages: true });
  assert.equal(seeing.images.length, 1);
  assert.match(seeing.images[0], /^data:image\/png;base64,/);
  const blind = buildKnowledgeContext({ sources, contextWindow: 128000, supportsImages: false });
  assert.equal(blind.images.length, 0);
  assert.match(blind.prompt, /can't see images/);
});

test('deleting a file removes it from search; the fit report compares with the model', async () => {
  const projectId = makeProject('Notes', 'Be brief.');
  const file = await store.addKnowledgeFile({ ownerType: 'project', ownerId: projectId, userId: user.id, fileName: 'zebra.txt', buffer: Buffer.from('Zebras have stripes.') });
  assert.equal(store.searchKnowledge([{ type: 'project', id: projectId }], 'zebra stripes').length, 1);
  assert.equal(store.deleteKnowledgeFile('project', projectId, file.id), true);
  assert.equal(store.searchKnowledge([{ type: 'project', id: projectId }], 'zebra stripes').length, 0);

  const report = knowledgeFitReport({ ownerType: 'project', ownerId: projectId, instructions: 'Be brief.', profile: { ready: true, model: 'm', contextWindow: 8192, supportsImages: false, contextSourceLabel: 'set for this model' } });
  assert.equal(report.fits, true);
  assert.equal(report.model.contextWindow, 8192);
});

test('chats in a project get its instructions even without folders', () => {
  const projectId = makeProject('Travel', 'Always list visa requirements.');
  const project = projectForChat(user.id, projectId);
  assert.equal(project.name, 'Travel');
  assert.equal(projectForChat('someone-else', projectId), null);
  const context = buildChatContext({ project, query: 'Plan a week in Japan', resolvedClient: { model: 'gpt-4.1', providerInfo: { providerId: 'openai', settings: {} } } });
  assert.match(context.prompt, /Always list visa requirements/);
  assert.deepEqual(context.sources, [{ type: 'project', id: projectId }]);
});

test('the project API saves instructions, takes uploads and lists chats', async () => {
  const projectId = makeProject('API');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: user.id }; req.db = null; next(); });
  app.use('/api/projects', projectRouter);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/projects/${projectId}`;
  try {
    const saved = await fetch(`${base}/instructions`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instructions: 'Use British spelling.' }) }).then((r) => r.json());
    assert.equal(saved.data.instructions, 'Use British spelling.');

    const form = new FormData();
    form.append('files', new Blob(['Kettle notes']), 'kettle.txt');
    form.append('files', new Blob([new Uint8Array([0, 0, 1])]), 'blob.bin');
    const upload = await fetch(`${base}/knowledge`, { method: 'POST', body: form }).then((r) => r.json());
    assert.equal(upload.data.length, 1);
    assert.equal(upload.errors.length, 1);

    const conversationId = randomUUID();
    db.prepare(`INSERT INTO conversations (id, user_id, workspace_id, title, project_ids) VALUES (?, ?, ?, ?, ?)`)
      .run(conversationId, user.id, workspace.id, 'Kettles', JSON.stringify([projectId]));
    const chats = await fetch(`${base}/chats`).then((r) => r.json());
    assert.deepEqual(chats.data.map((c) => c.id), [conversationId]);

    assert.equal((await fetch(`${base.replace(projectId, randomUUID())}/chats`)).status, 404);
  } finally {
    server.close();
  }
});
