// den/src/agent/skills.js
// Shared skill loader for bundled repo skills and user-created skills.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Skills now live inside the backend — no cross-package path needed.
export const BUNDLED_SKILLS_DIR = path.join(__dirname, 'skills');
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
      if (!inFrontmatter) { inFrontmatter = true; }
      else { bodyStart = i + 1; break; }
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
  console.log(`[agent] ${loadedSkills.length} skills loaded (${BUNDLED_SKILLS_DIR}, ${USER_SKILLS_DIR})`);
  return loadedSkills;
}

export function reloadSkills() {
  loadedSkills = [];
  _skillCache.clear();
  return loadSkills();
}

export function listSkills() {
  return loadedSkills;
}

// ── Tag normalization ────────────────────────────────────────────────────────

export function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
  if (typeof tags !== 'string') return [];
  return tags
    .replace(/^\s*\[/, '').replace(/\]\s*$/, '')
    .split(',')
    .map(t => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

// ── Skill cache ──────────────────────────────────────────────────────────────
// Avoids redundant LLM calls for the same goal within 5 minutes.

const _skillCache = new Map();
const SKILL_CACHE_TTL_MS = 5 * 60 * 1000;
const SKILL_CACHE_MAX = 50;

function _cacheKey(goal) {
  // Use truncated+normalized goal text as key — no hash collision risk.
  return String(goal || '').toLowerCase().trim().slice(0, 300);
}

function _getCachedSkills(goal) {
  const key = _cacheKey(goal);
  const entry = _skillCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > SKILL_CACHE_TTL_MS) {
    _skillCache.delete(key);
    return null;
  }
  return entry.result;
}

function _setCachedSkills(goal, result) {
  const key = _cacheKey(goal);
  if (_skillCache.size >= SKILL_CACHE_MAX) {
    _skillCache.delete(_skillCache.keys().next().value);
  }
  _skillCache.set(key, { result, timestamp: Date.now() });
}

// ── Deterministic matching (used as fallback and to supplement LLM picks) ───
// Keys are FRONTMATTER names (not filenames) — that is what loadedSkills stores.
// Run: grep '^name:' den/src/agent/skills/*.md to verify any name.

const SKILL_PATTERNS = [
  // Coding / engineering
  ['agentic-coding',            /\b(implement|feature|component|route|function|class|module|endpoint|fix\s+(?:the\s+)?(?:code|bug|issue)|write\s+(?:the\s+)?code|update\s+(?:the\s+)?(?:code|file|logic))\b/],
  ['git-workflow',              /\b(git|commit|branch|push|pull|stash|diff|merge|rebase|checkout|version\s+control|amend|cherry.?pick)\b/],
  ['effective-testing',         /\b(test|tests|testing|coverage|spec|suite|jest|vitest|pytest|mocha|cypress|playwright)\b/],
  ['tdd',                       /\b(tdd|test.?driven|test\s+first|red.?green|write\s+test\s+first)\b/],
  ['systematic-debugging',      /\b(debug|debugg|bug|error|exception|traceback|stack\s*trace|fails|failure|broken|regression|crash|not\s+working)\b/],
  ['code-review',               /\b(review|pr\b|pull\s*request|code\s*review|lgtm|patch)\b/],
  ['refactoring',               /\b(refactor|cleanup|clean\s+up|simplify|technical\s*debt|deduplicate|restructure|extract\s+function)\b/],
  ['performance-optimization',  /\b(performance|perf\b|speed|slow|latency|memory\s*leak|profil|benchmark|optimiz|throughput|cpu\s+usage)\b/],
  ['security-best-practices',   /\b(security|auth(?:entication|orization)?\b|cve\b|vulnerabilit|injection|xss|csrf|owasp|pentest|exploit|sanitiz)\b/],
  ['error-handling',            /\b(error.?handl|exception.?handl|retry|fallback|resilience|circuit.?breaker|graceful\s+degradation)\b/],
  ['rest-api-design',           /\b(api\s+design|rest(?:ful)?\s+api|graphql\s+schema|openapi|swagger|endpoint\s+design|interface\s+design|contract)\b/],
  // Infra / DevOps
  ['docker-basics',             /\b(docker|container|dockerfile|compose\b|image\s+build|kubernetes|k8s\b|pod\b|helm)\b/],
  ['deployment-patterns',       /\b(deploy|deployment|release|production|staging|heroku|aws\b|gcp\b|azure|vercel|render|fly\.io|ship\s+to)\b/],
  ['ci-cd-pipeline',            /\b(ci\b|cd\b|ci\/cd|github\s*actions|workflow\s+file|pipeline|jenkins|gitlab\s*ci|circleci|travis)\b/],
  ['database-migrations',       /\b(migration|migrate|schema\s+change|alembic|prisma\s+migrate|knex\s+migrate|sequel\s+migrate|db\s+change)\b/],
  ['sql-queries',               /\b(sql\b|query|queries|postgres|mysql|sqlite|select\b|join\b|index\b|explain\s+query)\b/],
  ['monitoring-setup',          /\b(monitor|monitoring|metrics|grafana|prometheus|alert|uptime|dashboard|observabilit|sentry)\b/],
  ['effective-logging',         /\b(log(?:ger|ging)?\b|winston|pino|structured\s+log|log\s+level|log\s+format)\b/],
  ['log-analysis',              /\b(log\s+analysis|parse\s+log|analyze\s+log|search\s+log|grep\s+log|log\s+pattern)\b/],
  ['cron-jobs',                 /\b(cron\b|schedule(?:d)?\s+job|recurring\s+task|timer|interval\s+job|cron\s+expression)\b/],
  // Docs / writing
  ['effective-documentation',   /\b(document(?:ation)?|readme|wiki|jsdoc|docstring|api\s+docs|write\s+docs|add\s+comments)\b/],
  ['report-writing',            /\b(report|write\s+(?:a\s+)?report|generate\s+report|executive\s+summary)\b/],
  ['email-drafting',            /\b(email|draft\s+(?:an?\s+)?email|write\s+(?:an?\s+)?email|gmail|smtp|outreach)\b/],
  ['document-generation',       /\b(generate\s+(?:a\s+)?(?:document|pdf|doc)\b|pdf\s+report|word\s+document|from\s+template)\b/],
  // Data / analytics
  ['statistics-interpretation', /\b(statistic|average|median|regression|correlation|data\s+analysis|hypothesis|p.?value|confidence\s+interval)\b/],
  ['data-interpretation',       /\b(interpret\s+data|data\s+insight|visualize\s+data|chart\b|graph\b|plot\b|trend\s+analysis)\b/],
  // Planning / architecture
  ['plan',                      /\b(plan\b|planning|roadmap|design\s+doc|breakdown\s+(?:the\s+)?task|step.?by.?step)\b/],
  ['architecture-review',       /\b(architecture|system\s+design|trade.?off|design\s+decision|scalab|coupling|microservice|monolith)\b/],
  // UX / research
  ['ui-ux-review',              /\b(ui\b|ux\b|user\s+interface|user\s+experience|design\s+review|figma|wireframe)\b/],
  ['accessibility-audit',       /\b(accessib|a11y\b|aria\b|wcag|screen\s+reader|contrast\s+ratio|keyboard\s+nav)\b/],
  ['web-research',              /\b(web\s+research|search\s+(?:the\s+)?web|browse|scrape|crawl|look\s+up\s+online|fetch\s+url)\b/],
  // Frameworks (new)
  ['nextjs-patterns',           /\b(next\.?js|app\s+router|server\s+component|server\s+action|edge\s+runtime|next\s+config)\b/],
  ['react-patterns',            /\b(react|jsx\b|tsx\b|hook\b|use(?:State|Effect|Memo|Callback|Ref|Context)|context\s+api|component\s+pattern)\b/],
  // Ops
  ['incident-response',         /\b(incident|outage|production\s+down|on.?call|postmortem|root\s+cause|sev\d|pager|escalat)\b/],
  ['onboarding-new-codebase',   /\b(onboard|new\s+(?:to\s+(?:the\s+)?)?(?:repo|codebase|project)|explore\s+(?:the\s+)?(?:repo|code)|understand\s+(?:the\s+)?(?:codebase|project|repo))\b/],
  // Data engineering
  ['data-engineering',          /\b(etl\b|pipeline\s+(?:data|ingestion)|dbt\b|airflow|spark\b|kafka\b|data\s+warehouse|ingestion|transformation\s+pipeline)\b/],
];

function deterministicSkillMatch(goal = '', limit = 5) {
  const text = String(goal || '').toLowerCase();
  const matched = [];

  for (const [skillName, pattern] of SKILL_PATTERNS) {
    if (pattern.test(text) && !matched.includes(skillName)) {
      matched.push(skillName);
    }
    if (matched.length >= limit) break;
  }

  return skillsByNames(matched, limit);
}

// ── Tag-based secondary matching ─────────────────────────────────────────────
// If the keyword patterns miss a skill, try matching goal words against skill tags.

function tagBasedMatch(goal = '', excludeNames, limit = 3) {
  const words = String(goal || '').toLowerCase().split(/\W+/).filter(w => w.length > 3);
  if (!words.length) return [];

  const scored = [];
  for (const skill of loadedSkills) {
    if (excludeNames.has(skill.name)) continue;
    const tags = normalizeTags(skill.tags).map(t => t.toLowerCase());
    const score = words.filter(w => tags.some(t => t.includes(w) || w.includes(t))).length;
    if (score > 0) scored.push({ skill, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.skill);
}

function skillsByNames(names = [], limit = 5) {
  const byName = new Map(loadedSkills.map(skill => [skill.name, skill]));
  const selected = [];
  for (const name of names) {
    const skill = byName.get(name);
    if (skill && !selected.some(s => s.name === name)) selected.push(skill);
    if (selected.length >= limit) break;
  }
  return selected;
}

// ── JSON extraction helper ───────────────────────────────────────────────────

function extractJsonObject(text = '') {
  const cleaned = String(text || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ── Workspace context detection ──────────────────────────────────────────────

function detectWorkspaceContext(workingDir) {
  if (!workingDir) return {};
  try {
    const has = (f) => fs.existsSync(path.join(workingDir, f));
    const projectType = has('package.json') ? 'javascript/typescript'
      : has('pyproject.toml') || has('requirements.txt') ? 'python'
      : has('go.mod') ? 'go'
      : has('Cargo.toml') ? 'rust'
      : has('pom.xml') || has('build.gradle') ? 'java'
      : has('composer.json') ? 'php'
      : null;
    return projectType ? { projectType } : {};
  } catch {
    return {};
  }
}

// ── Main skill selection function ────────────────────────────────────────────
// Uses the active LLM (any OpenAI-compatible provider) to pick relevant skills.
// Falls back to deterministic regex + tag matching when the LLM is unavailable.

export async function selectRelevantSkillsWithLlm({
  aiClient,
  model,
  goal,
  conversationHistory = [],
  workingDir = null,
  limit = 5,
} = {}) {
  // Return cached result for the same goal within TTL
  const cached = _getCachedSkills(goal);
  if (cached) return { ...cached, method: `${cached.method}-cached` };

  if (!goal || loadedSkills.length === 0) {
    const fallback = _runDeterministic(goal, limit);
    const result = { skills: fallback, method: fallback.length ? 'deterministic' : 'no-skills' };
    _setCachedSkills(goal, result);
    return result;
  }

  // Workspace context gives the LLM better signal (project type, etc.)
  const wsContext = workingDir ? detectWorkspaceContext(workingDir) : {};

  // Use any OpenAI-compatible LLM — works with Anthropic, OpenRouter,
  // Ollama, Groq, OpenAI, and every other provider in clientFactory.
  const llmCreate = aiClient?.client?.chat?.completions?.create?.bind(aiClient.client.chat.completions);

  if (!llmCreate) {
    const fallback = _runDeterministic(goal, limit);
    const result = {
      skills: fallback,
      method: fallback.length ? 'deterministic-no-client' : 'llm-unavailable',
      reason: 'No compatible LLM client available',
    };
    _setCachedSkills(goal, result);
    return result;
  }

  const catalog = loadedSkills.map(skill => ({
    name: skill.name,
    description: skill.description || '',
    when_to_use: skill.when_to_use || '',
    tags: normalizeTags(skill.tags),
  }));

  const recentContext = conversationHistory
    .filter(m => m?.role === 'user' || m?.role === 'assistant')
    .slice(-4)
    .map(m => `${m.role}: ${String(m.content || '').slice(0, 600)}`)
    .join('\n');

  try {
    const response = await llmCreate({
      model,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content: [
            'You select reusable agent skills for the next task.',
            'Choose only skills that materially improve the agent response or workflow.',
            'Prefer zero skills for ordinary chat, explanation, or trivial tasks.',
            `Return ONLY JSON: {"skills":["exact-skill-name"],"reason":"one short sentence"}.`,
            `Select at most ${limit} skills. Use exact names from the catalog. Do not invent names.`,
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            goal,
            recent_context: recentContext || undefined,
            workspace: Object.keys(wsContext).length ? wsContext : undefined,
            skill_catalog: catalog,
          }),
        },
      ],
    });

    const raw = response.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(raw);
    const llmPicks = Array.isArray(parsed?.skills)
      ? parsed.skills.map(n => String(n || '').trim()).filter(Boolean)
      : [];

    // Merge LLM picks with deterministic matches (LLM takes priority)
    const deterministicPicks = deterministicSkillMatch(goal, limit).map(s => s.name);
    const merged = [...new Set([...llmPicks, ...deterministicPicks])];

    const result = {
      skills: skillsByNames(merged, limit),
      method: 'llm',
      reason: typeof parsed?.reason === 'string' ? parsed.reason.slice(0, 240) : '',
    };
    _setCachedSkills(goal, result);
    return result;
  } catch (err) {
    console.warn('[agent] LLM skill selection failed; using deterministic fallback:', err.message);
    const fallback = _runDeterministic(goal, limit);
    const result = {
      skills: fallback,
      method: fallback.length ? 'deterministic-fallback' : 'llm-failed',
      reason: err.message,
    };
    _setCachedSkills(goal, result);
    return result;
  }
}

// Combines regex patterns + tag matching into one ranked list.
function _runDeterministic(goal, limit) {
  const direct = deterministicSkillMatch(goal, limit);
  if (direct.length >= limit) return direct;

  const excluded = new Set(direct.map(s => s.name));
  const tagMatches = tagBasedMatch(goal, excluded, limit - direct.length);
  return [...direct, ...tagMatches].slice(0, limit);
}
