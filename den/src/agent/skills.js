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

export function findRelevantSkills(goal, limit = 3) {
  if (!goal || loadedSkills.length === 0) return [];
  const q = goal.toLowerCase();

  return loadedSkills
    .map(skill => {
      const haystack = [
        skill.name,
        skill.description,
        skill.tags,
        skill.when_to_use,
        skill.body,
      ].filter(Boolean).join(' ').toLowerCase();

      const nameHit = skill.name?.toLowerCase().includes(q) ? 3 : 0;
      const descHit = skill.description?.toLowerCase().includes(q) ? 2 : 0;
      const bodyHit = haystack.includes(q) ? 1 : 0;
      const tokenHits = q.split(/\s+/).filter(token => token.length > 2 && haystack.includes(token)).length;

      return { skill, score: nameHit + descHit + bodyHit + tokenHits };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.skill);
}
