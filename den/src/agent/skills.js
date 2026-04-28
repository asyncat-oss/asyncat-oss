// den/src/agent/skills.js
// Shared skill loader for bundled repo skills and user-created skills.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
export const BUNDLED_SKILLS_DIR = path.join(REPO_ROOT, 'cli', 'skills');
export const USER_SKILLS_DIR = path.join(
  process.env.ASYNCAT_HOME || path.join(os.homedir(), '.asyncat'),
  'skills',
);

let loadedSkills = [];

function parseFrontmatter(content, fallbackName) {
  const lines = content.split('\n');
  const frontmatter = {};
  let inFrontmatter = false;
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
      } else {
        bodyStart = i + 1;
        break;
      }
      continue;
    }
    if (inFrontmatter && line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      frontmatter[key.trim()] = valueParts.join(':').trim();
    }
  }

  return {
    name: frontmatter.name || fallbackName,
    ...frontmatter,
    body: lines.slice(bodyStart).join('\n').trim(),
  };
}

function readSkillsFromDir(dir, source) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.md') && !file.startsWith('_'))
    .map(file => {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      return {
        ...parseFrontmatter(content, file.replace(/\.md$/, '')),
        source,
        path: path.join(dir, file),
      };
    });
}

export function loadSkills() {
  const byName = new Map();

  for (const skill of readSkillsFromDir(BUNDLED_SKILLS_DIR, 'bundled')) {
    byName.set(skill.name, skill);
  }

  for (const skill of readSkillsFromDir(USER_SKILLS_DIR, 'user')) {
    byName.set(skill.name, skill);
  }

  loadedSkills = [...byName.values()];
  console.log(
    `[agent] ${loadedSkills.length} skills loaded from Cerebellum ` +
    `(${BUNDLED_SKILLS_DIR}, ${USER_SKILLS_DIR})`
  );
  return loadedSkills;
}

export function listSkills() {
  return loadedSkills;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'yet', 'so',
  'in', 'on', 'at', 'to', 'by', 'up', 'of', 'as', 'is', 'it',
  'its', 'be', 'do', 'did', 'has', 'had', 'was', 'are', 'not',
  'can', 'you', 'me', 'my', 'we', 'us', 'i', 'he', 'she', 'they',
  'that', 'this', 'with', 'from', 'have', 'will', 'would', 'could',
  'should', 'your', 'our', 'their', 'what', 'how', 'when', 'where',
  'which', 'who', 'make', 'want', 'need', 'get', 'show', 'tell',
  'load', 'use', 'run', 'add', 'new', 'some', 'any', 'all', 'more',
  'also', 'just', 'now', 'then', 'too', 'very', 'about', 'like',
  'into', 'than', 'over', 'such', 'here', 'there', 'please',
]);

export function findRelevantSkills(goal, limit = 3) {
  if (!goal || loadedSkills.length === 0) return [];
  const q = goal.toLowerCase();

  const tokens = q
    .split(/\s+/)
    .map(t => t.replace(/[^a-z0-9-]/g, ''))
    .filter(t => t.length > 3 && !STOP_WORDS.has(t));

  if (tokens.length === 0) return [];

  return loadedSkills
    .map(skill => {
      const nameStr = (skill.name || '').toLowerCase();
      const descStr = (skill.description || '').toLowerCase();
      const whenStr = (skill.when_to_use || '').toLowerCase();
      const tagsStr = (Array.isArray(skill.tags) ? skill.tags.join(' ') : String(skill.tags || '')).toLowerCase();
      const bodyStr = (skill.body || '').toLowerCase();

      // Name/description hits are strong signals
      const nameHit = tokens.some(t => nameStr.includes(t)) ? 4 : 0;
      const descHit = tokens.filter(t => descStr.includes(t)).length * 2;
      const whenHit = tokens.filter(t => whenStr.includes(t)).length * 2;
      const tagsHit = tokens.filter(t => tagsStr.includes(t)).length * 2;
      // Body token hits are weak — only count unique matches
      const bodyTokens = new Set(tokens.filter(t => bodyStr.includes(t)));
      const bodyHit = bodyTokens.size;

      return { skill, score: nameHit + descHit + whenHit + tagsHit + bodyHit };
    })
    .filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.skill);
}
