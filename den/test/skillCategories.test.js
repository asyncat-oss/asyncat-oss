import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

// Skills are filed under plain categories (Planning, Workflow, Recall, Risk
// checks, Habits, Tone). Skill files keep the brain_region key they always
// had; the mapping goes both ways.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-skill-categories-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
process.env.ASYNCAT_HOME = path.join(scratch, 'home');

const { SKILL_CATEGORIES, categoryForRegion, regionForCategory } = await import('../src/agent/skillCategories.js');
const skills = await import('../src/agent/skills.js');
const { default: express } = await import('express');
const { default: db } = await import('../src/db/client.js');
const { default: aiAgentRoutes } = await import('../src/ai/routes/aiAgentRoutes.js');

const userId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, 'demo@example.test', 'Demo')").run(userId);
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: userId }; req.db = null; next(); });
app.use('/api/agent', aiAgentRoutes);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/agent`;

test.after(() => {
  server.close();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

const fileOf = (name) => fs.readFileSync(path.join(skills.USER_SKILLS_DIR, `${name}.md`), 'utf8');

test('each brain region has a plain name, and back', () => {
  const pairs = {
    prefrontal: 'Planning', cerebellum: 'Workflow', hippocampus: 'Recall',
    amygdala: 'Risk checks', basal_ganglia: 'Habits', limbic: 'Tone', unknown: 'Other',
  };
  for (const [region, name] of Object.entries(pairs)) {
    assert.equal(categoryForRegion(region), name, region);
    assert.equal(regionForCategory(name), region, name);
  }
  assert.deepEqual(SKILL_CATEGORIES.map((category) => category.name), Object.values(pairs), 'in the order the page shows them');
});

test('names are matched loosely, and anything unknown is Other', () => {
  assert.equal(categoryForRegion('Basal Ganglia'), 'Habits');
  assert.equal(categoryForRegion('basal-ganglia'), 'Habits');
  assert.equal(regionForCategory('risk checks'), 'amygdala');
  assert.equal(regionForCategory('Risk Checks'), 'amygdala', 'the old heading spelling');
  assert.equal(regionForCategory('  tone '), 'limbic');
  assert.equal(regionForCategory('cerebellum'), 'cerebellum', 'an old key stays itself');
  for (const odd of [undefined, null, '', 'occipital', 'Gardening']) {
    assert.equal(categoryForRegion(odd), 'Other', String(odd));
    assert.equal(regionForCategory(odd), 'unknown', String(odd));
  }
});

test('every bundled skill has a category', () => {
  skills.loadSkills();
  const bundled = skills.listSkills().filter((skill) => skill.source === 'bundled');
  assert.ok(bundled.length > 0);
  for (const skill of bundled) assert.notEqual(skill.category, 'Other', `${skill.name} (${skill.brain_region})`);
});

test('a new skill is saved with its category as brain_region, and read back by name', async () => {
  const res = await fetch(`${base}/skills`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Check before pruning', description: 'Look twice before cutting.', category: 'Risk checks' }),
  });
  assert.equal(res.status, 201);
  assert.match(fileOf('check-before-pruning'), /^brain_region: amygdala$/m, 'the file keeps the old key');

  const listed = await (await fetch(`${base}/skills`)).json();
  assert.equal(listed.skills.find((skill) => skill.name === 'Check before pruning').category, 'Risk checks');
  assert.deepEqual(listed.categories.map((category) => category.name), SKILL_CATEGORIES.map((category) => category.name));
  assert.ok(listed.categories.every((category) => category.description), 'each has a line for its heading');

  // Changing the category rewrites the key; an old-style brain_region still works.
  skills.updateSkill('Check before pruning', { category: 'Tone' });
  assert.match(fileOf('check-before-pruning'), /^brain_region: limbic$/m);
  skills.createSkill({ name: 'Old style', brain_region: 'hippocampus' });
  assert.equal(skills.listSkills().find((skill) => skill.name === 'Old style').category, 'Recall');
  skills.createSkill({ name: 'No category' });
  assert.match(fileOf('no-category'), /^brain_region: unknown$/m);
});

test('a skill saved from a chat suggestion is filed under Recall', () => {
  assert.equal(categoryForRegion(skills.skillFromDraft({ name: 'From a chat' }).brain_region), 'Recall');
});
