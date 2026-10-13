#!/usr/bin/env node
// Release notes from the commits since the previous tag, for the GitHub
// release and the in-app update screen. GitHub's generated notes only list
// pull requests, and this repo commits straight to master.
//
//   node scripts/release-notes.js v0.8.0-beta.7 > release-notes.md

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = 'asyncat-oss/asyncat-oss';

const SECTIONS = [
  { title: 'New', types: ['feat'] },
  { title: 'Fixes', types: ['fix'] },
  { title: 'Other changes', types: ['perf', 'refactor', 'style', 'docs', 'build', 'ci', 'chore', 'test'] },
];

/** "feat(neko): one chat box" → { type: 'feat', text: 'One chat box' }. */
export function parseSubject(subject) {
  const match = String(subject || '').match(/^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/);
  const type = match ? match[1].toLowerCase() : 'other';
  const text = (match ? match[2] : String(subject || '')).trim();
  return { type, text: text ? text[0].toUpperCase() + text.slice(1) : text };
}

export function buildReleaseNotes(subjects, { tag, previousTag = null, repo = REPO } = {}) {
  const parsed = subjects
    .map(parseSubject)
    .filter((entry) => entry.text && !/^(merge|release|bump version)\b/i.test(entry.text));
  const lines = [];
  for (const section of SECTIONS) {
    const entries = parsed.filter((entry) => section.types.includes(entry.type));
    if (!entries.length) continue;
    lines.push(`## ${section.title}`, '', ...entries.map((entry) => `- ${entry.text}`), '');
  }
  const known = new Set(SECTIONS.flatMap((section) => section.types));
  const rest = parsed.filter((entry) => !known.has(entry.type));
  if (rest.length) {
    if (!lines.length) lines.push('## Changes', '');
    else lines.push('## More', '');
    lines.push(...rest.map((entry) => `- ${entry.text}`), '');
  }
  if (previousTag && tag) lines.push(`**Full changelog:** https://github.com/${repo}/compare/${previousTag}...${tag}`);
  return `${lines.join('\n').trim()}\n`;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function main() {
  const tag = process.argv[2];
  if (!tag) throw new Error('Usage: node scripts/release-notes.js <tag>');
  let previousTag = null;
  try { previousTag = git(['describe', '--tags', '--abbrev=0', `${tag}^`]); } catch { /* first release */ }
  const range = previousTag ? `${previousTag}..${tag}` : tag;
  const subjects = git(['log', '--no-merges', '--format=%s', ...(previousTag ? [] : ['-n', '50']), range]).split('\n').filter(Boolean);
  process.stdout.write(buildReleaseNotes(subjects, { tag, previousTag }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[release-notes] ${error.message}`);
    process.exitCode = 1;
  }
}
