import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CATEGORY, categoryOptions, groupByCategory, skillCategory, skillMatches } from './skillCategories.js';

const CATEGORIES = [
  { name: 'Planning', description: 'Shaping a goal and reasoning step by step' },
  { name: 'Workflow', description: 'Procedures and repeatable ways of working' },
  { name: 'Risk checks', description: 'Safety, permissions and care with big changes' },
  { name: 'Other', description: 'Skills with no category' },
];

const skills = [
  { name: 'git-workflow', description: 'Branches and commits', category: 'Workflow', tags: ['git'] },
  { name: 'careful-deletes', description: 'Ask before removing files', category: 'Risk checks', tags: [] },
  { name: 'plan-first', description: 'Write the plan down', category: 'Planning' },
  { name: 'loose', description: 'No category given' },
  { name: 'newer', description: 'From a newer den', category: 'Gardening' },
];

test('search matches the plain category names, not brain regions', () => {
  const found = (query) => skills.filter((skill) => skillMatches(skill, query)).map((skill) => skill.name);
  assert.deepEqual(found('risk'), ['careful-deletes']);
  assert.deepEqual(found('Planning'), ['plan-first']);
  assert.deepEqual(found('other'), ['loose'], 'a skill with none is Other');
  assert.deepEqual(found('amygdala'), [], 'the old key means nothing here');
  assert.deepEqual(found('git'), ['git-workflow']);
  assert.deepEqual(found('plan'), ['plan-first'], 'names and descriptions still count');
  assert.equal(found('  ').length, skills.length);
});

test('groups follow den\'s order, then categories it did not list, and skip empty ones', () => {
  const groups = groupByCategory(skills, CATEGORIES);
  assert.deepEqual(groups.map((group) => group.name), ['Planning', 'Workflow', 'Risk checks', 'Other', 'Gardening']);
  assert.equal(groups[2].description, 'Safety, permissions and care with big changes');
  assert.deepEqual(groups[3].skills.map((skill) => skill.name), ['loose']);
  assert.deepEqual(groupByCategory([], CATEGORIES), []);
  assert.deepEqual(groupByCategory(skills.slice(0, 1)).map((group) => group.name), ['Workflow'], 'without a list from den');
});

test('the New skill form offers the plain names', () => {
  assert.deepEqual(categoryOptions(CATEGORIES).map((option) => option.label), ['Planning', 'Workflow', 'Risk checks', 'Other']);
  assert.deepEqual(categoryOptions([]).map((option) => option.value), [DEFAULT_CATEGORY, 'Other'], 'before the list arrives');
  assert.equal(skillCategory({ category: '  ' }), 'Other');
});
