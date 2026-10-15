import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Skill files start with YAML frontmatter. Most bundled skills write
// when_to_use as a block (`when_to_use: |` over indented lines); the text
// under it is the value, and its lines never become keys of their own.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-skill-files-${randomUUID()}-`));
process.env.ASYNCAT_HOME = path.join(scratch, 'home');

const skills = await import('../src/agent/skills.js');

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const find = (name) => skills.listSkills().find((skill) => skill.name === name);

test('a bundled skill\'s when_to_use is its text, not the "|" that starts it', () => {
  skills.loadSkills();
  assert.equal(find('code-review').when_to_use, 'When reviewing code changes, diffs, pull requests, commits, or patches.');
  const accessibility = find('accessibility-audit');
  assert.match(accessibility.when_to_use, /^When asked to audit, improve, or implement accessibility in a web UI:\nARIA labels/);
  assert.equal(Object.keys(accessibility).some((key) => key.startsWith('When asked')), false, 'an indented line with a colon is not a key');
  for (const skill of skills.listSkills()) {
    assert.doesNotMatch(String(skill.when_to_use ?? ''), /^[|>]$/, skill.name);
    assert.ok(skill.body.length > 0, `${skill.name} keeps its body`);
  }
  assert.deepEqual(find('document-generation').triggers.slice(0, 2), ['create a report', 'generate documentation'], 'a `- item` list');
});

test('folded text, lists and plain values that carry on are read whole', () => {
  fs.mkdirSync(skills.USER_SKILLS_DIR, { recursive: true });
  fs.writeFileSync(path.join(skills.USER_SKILLS_DIR, 'tending.md'), [
    '---',
    'name: tending',
    'description: Water the plants',
    '  before noon.',
    'brain_region: cerebellum',
    'tags: [garden, plants]',
    'when_to_use: >',
    '  When the soil',
    '  is dry.',
    '',
    '  Or the leaves droop.',
    'aliases:',
    '  - "watering"',
    '  - misting',
    '---',
    '1. Check the soil.',
  ].join('\r\n'));
  skills.reloadSkills();
  const skill = find('tending');
  assert.equal(skill.description, 'Water the plants before noon.');
  assert.equal(skill.when_to_use, 'When the soil is dry.\nOr the leaves droop.');
  assert.deepEqual(skill.aliases, ['watering', 'misting']);
  assert.deepEqual(skills.normalizeTags(skill.tags), ['garden', 'plants']);
  assert.equal(skill.category, 'Workflow');
  assert.equal(skill.body.trim(), '1. Check the soil.');
});

test('a new skill with several lines of when_to_use reads back the same', () => {
  const when = 'When a seedling looks leggy.\nOr: when it leans toward the window.';
  skills.createSkill({ name: 'Leggy seedlings', description: 'Give them more light.', category: 'Habits', when_to_use: when, body: '1. Move them closer to the light.' });
  const file = fs.readFileSync(path.join(skills.USER_SKILLS_DIR, 'leggy-seedlings.md'), 'utf8');
  assert.match(file, /^when_to_use: \|\n {2}When a seedling looks leggy\.\n {2}Or: when it leans toward the window\.$/m);
  const skill = find('Leggy seedlings');
  assert.equal(skill.when_to_use, when);
  assert.equal(skill.description, 'Give them more light.');
  assert.equal(Object.hasOwn(skill, 'Or'), false);

  // Editing another field keeps it.
  skills.updateSkill('Leggy seedlings', { description: 'More light, less water.' });
  assert.equal(find('Leggy seedlings').when_to_use, when);
  assert.equal(find('Leggy seedlings').description, 'More light, less water.');
});
