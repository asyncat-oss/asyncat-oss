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

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
  if (typeof tags !== 'string') return [];
  return tags
    .replace(/^\s*\[/, '')
    .replace(/\]\s*$/, '')
    .split(',')
    .map(t => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function extractJsonObject(text = '') {
  const cleaned = String(text || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function deterministicSkillNames(goal = '') {
  const text = String(goal || '').toLowerCase();
  const names = [];
  const add = (name) => { if (!names.includes(name)) names.push(name); };

  if (/\b(code|coding|implement|fix|bug|refactor|test|lint|build|review|diff|commit|repo|repository|file|component|route|api)\b/.test(text)) {
    add('agentic-coding');
  }
  if (/\b(git|commit|branch|push|pull|stash|diff|merge|rebase|checkout)\b/.test(text)) {
    add('git-workflow');
  }
  if (/\b(test|tests|testing|coverage|spec|failing test)\b/.test(text)) {
    add('effective-testing');
  }
  if (/\b(debug|bug|error|fails|failure|broken|regression|stack trace|exception)\b/.test(text)) {
    add('systematic-debugging');
  }
  if (/\b(review|pr|pull request|diff|patch)\b/.test(text)) {
    add('code-review');
  }
  if (/\b(refactor|cleanup|simplify|technical debt|deduplicate)\b/.test(text)) {
    add('refactoring');
  }

  return names;
}

function skillsByNames(names = [], limit = 5) {
  const byName = new Map(loadedSkills.map(skill => [skill.name, skill]));
  const selected = [];
  for (const name of names) {
    const skill = byName.get(name);
    if (skill && !selected.some(item => item.name === skill.name)) selected.push(skill);
    if (selected.length >= limit) break;
  }
  return selected;
}

export async function selectRelevantSkillsWithLlm({
  aiClient,
  model,
  goal,
  conversationHistory = [],
  limit = 5,
} = {}) {
  if (!goal || loadedSkills.length === 0 || !aiClient?.messages?.create) {
    const fallback = skillsByNames(deterministicSkillNames(goal), limit);
    return { skills: fallback, method: fallback.length ? 'deterministic' : 'llm-unavailable' };
  }

  const catalog = loadedSkills.map(skill => ({
    name: skill.name,
    description: skill.description || '',
    when_to_use: skill.when_to_use || '',
    brain_region: skill.brain_region || 'unknown',
    tags: normalizeTags(skill.tags),
  }));

  const recentContext = conversationHistory
    .filter(m => m?.role === 'user' || m?.role === 'assistant')
    .slice(-4)
    .map(m => `${m.role}: ${String(m.content || '').slice(0, 600)}`)
    .join('\n');

  try {
    const response = await aiClient.messages.create({
      model,
      max_completion_tokens: 600,
      system: [
        'You select reusable agent skills for the next task.',
        'Choose only skills that materially improve the agent response or workflow.',
        'Prefer zero skills for ordinary chat, explanation, or tasks that do not match a skill.',
        `Return only JSON: {"skills":["exact-skill-name"],"reason":"short reason"}.`,
        `Select at most ${limit} skills. Use exact names from the catalog. Do not invent names.`,
      ].join(' '),
      messages: [{
        role: 'user',
        content: JSON.stringify({
          goal,
          recent_context: recentContext,
          skill_catalog: catalog,
        }),
      }],
    });

    const raw = response.content?.[0]?.text || '';
    const parsed = extractJsonObject(raw);
    const requested = Array.isArray(parsed?.skills) ? parsed.skills : [];

    return {
      skills: skillsByNames([
        ...requested.map(name => String(name || '').trim()),
        ...deterministicSkillNames(goal),
      ], limit),
      method: 'llm',
      reason: typeof parsed?.reason === 'string' ? parsed.reason.slice(0, 240) : '',
    };
  } catch (err) {
    console.warn('[agent] LLM skill selection failed; no skills will be injected:', err.message);
    const fallback = skillsByNames(deterministicSkillNames(goal), limit);
    return {
      skills: fallback,
      method: fallback.length ? 'deterministic-fallback' : 'llm-failed',
      reason: err.message,
    };
  }
}

export { normalizeTags };
