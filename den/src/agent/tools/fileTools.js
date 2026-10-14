// den/src/agent/tools/fileTools.js
// ─── File System Tools ───────────────────────────────────────────────────────
// read, write, edit, search, list files in the agent's working directory.
// All paths are resolved relative to the working directory and sandboxed.

import fs from 'fs';
import path from 'path';
import * as parser from '@babel/parser';
import { PermissionLevel } from './toolRegistry.js';
import { clampInt, firstLines, hasBin, runFile, safePath, truncate } from './shared.js';
import { applyHunks, parseUnifiedDiff, stripComponents } from './unifiedDiff.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate JS/TS syntax of proposed file content before writing. No-op for
 * non-JS/TS files, so atomic multi-file patches never leave a file in a
 * syntactically broken state.
 */
function verifyJsSyntax(filePath, newContent) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) return { valid: true };
  try {
    parser.parse(newContent, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties', 'decorators-legacy',
        'dynamicImport', 'exportDefaultFrom', 'optionalChaining', 'nullishCoalescingOperator'],
    });
    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Syntax error introduced by edit: ${err.message}` };
  }
}

/**
 * Find the closest matching lines in file content when exact match fails.
 * Returns the top N candidate line ranges that partially match the search text.
 * This helps the agent self-correct by seeing what the file actually contains.
 */
function _findClosestLines(content, searchText, maxCandidates = 3) {
  if (!content || !searchText) return [];
  const contentLines = content.split('\n');
  const searchLines = searchText.split('\n').map(l => l.trim()).filter(Boolean);
  if (searchLines.length === 0 || contentLines.length === 0) return [];

  const firstSearchLine = searchLines[0].toLowerCase();
  const candidates = [];

  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i].trim().toLowerCase();
    if (!line) continue;

    // Score: how many characters from the first search line appear in this line
    let matchChars = 0;
    const words = firstSearchLine.split(/\s+/).filter(w => w.length > 2);
    for (const word of words) {
      if (line.includes(word)) matchChars += word.length;
    }

    if (matchChars > firstSearchLine.length * 0.3) {
      const contextEnd = Math.min(i + searchLines.length + 1, contentLines.length);
      const snippet = contentLines.slice(i, contextEnd).join('\n').slice(0, 300);
      candidates.push({
        line_number: i + 1,
        score: matchChars / firstSearchLine.length,
        content: snippet,
      });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates)
    .map(c => `Line ${c.line_number} (${Math.round(c.score * 100)}% match):\n${c.content}`);
}

// ── Tool definitions ─────────────────────────────────────────────────────────

export const readFileTool = {
  name: 'read_file',
  description: 'Read the contents of a file. Returns the file content with line numbers. Use this to understand existing code or data before making changes.',
  category: 'file',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to working directory' },
      start_line: { type: 'number', description: 'Start line (1-indexed, optional)' },
      end_line: { type: 'number', description: 'End line (1-indexed, inclusive, optional)' },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${args.path}` };
    }
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return { success: false, error: `"${args.path}" is a directory, not a file. Use list_directory instead.` };
    }
    if (stat.size > 1024 * 1024) {
      return { success: false, error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Use start_line/end_line to read a portion.` };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const start = Math.max(1, args.start_line || 1);
    const end = Math.min(lines.length, args.end_line || lines.length);
    const slice = lines.slice(start - 1, end);

    const numbered = slice.map((line, i) => `${start + i}: ${line}`).join('\n');

    // Smart truncation: keep head + tail so the agent sees file structure
    const MAX_READ_CHARS = 20000;
    let displayContent;
    if (numbered.length <= MAX_READ_CHARS) {
      displayContent = numbered;
    } else {
      const headSize = Math.floor(MAX_READ_CHARS * 0.7);
      const tailSize = Math.floor(MAX_READ_CHARS * 0.25);
      const head = numbered.slice(0, headSize);
      const tail = numbered.slice(-tailSize);
      const skippedChars = numbered.length - headSize - tailSize;
      displayContent = `${head}\n\n... [${skippedChars} chars skipped — use start_line/end_line to read specific sections] ...\n\n${tail}`;
    }

    return {
      success: true,
      path: args.path,
      total_lines: lines.length,
      showing: `${start}-${end}`,
      // Hint: if the file is large, tell the agent it should use line ranges
      ...(lines.length > 300 && !args.start_line ? {
        hint: `This file has ${lines.length} lines. For large edits, read specific sections with start_line/end_line.`,
      } : {}),
      content: displayContent,
    };
  },
};

export const writeFileTool = {
  name: 'write_file',
  description: 'Create a new file or overwrite an existing file with the given content. Parent directories are created automatically.',
  category: 'file',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to working directory' },
      content: { type: 'string', description: 'File content to write' },
    },
    required: ['path', 'content'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    const existed = fs.existsSync(filePath);
    if (existed) {
      const existingStat = fs.statSync(filePath);
      if (existingStat.size > 50000) {
        // Warn when overwriting large files — the agent might intend edit_file instead
        // (we still do the write, but the warning helps the agent notice mistakes)
      }
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, args.content, 'utf8');
    const lines = args.content.split('\n').length;
    return {
      success: true,
      path: args.path,
      action: existed ? 'overwritten' : 'created',
      lines,
      bytes: Buffer.byteLength(args.content, 'utf8'),
      ...(existed ? { warning: 'File was overwritten. If you intended a partial edit, use edit_file or apply_patch instead.' } : {}),
    };
  },
};

export const createDirectoryTool = {
  name: 'create_directory',
  description: 'Create a directory and any missing parent directories inside the working directory. Use this instead of shell mkdir for folder creation.',
  category: 'file',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path relative to working directory' },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const dirPath = safePath(args.path, context.workingDir);
    const existed = fs.existsSync(dirPath);
    if (existed && !fs.statSync(dirPath).isDirectory()) {
      return { success: false, error: `"${args.path}" exists and is not a directory.` };
    }
    fs.mkdirSync(dirPath, { recursive: true });
    return {
      success: true,
      path: args.path,
      action: existed ? 'already_exists' : 'created',
    };
  },
};

/**
 * Lines from..to (exclusive) of a file replaced by text. A CRLF line ending
 * after them stays, and a line break the old text began or ended with goes
 * with it, as it would in an exact replacement.
 */
function replaceLines(lines, from, to, text, oldString) {
  let head = from > 0 ? `${lines.slice(0, from).join('\n')}\n` : '';
  let tail = to < lines.length ? `\n${lines.slice(to).join('\n')}` : '';
  if (lines[to - 1].endsWith('\r')) tail = `\r${tail}`;
  if (/^\r?\n/.test(oldString)) head = head.replace(/\r?\n$/, '');
  if (oldString.endsWith('\n')) tail = tail.replace(/^\r?\n/, '');
  return head + text + tail;
}

/**
 * Replace oldString in content: exactly, or (when that finds nothing) with
 * whitespace-normalised lines, as long as the match is unique. Returns
 * { content, mode } or { error, count?, closest? }.
 */
function replaceText(content, oldString, newString, { replaceAll = false } = {}) {
  if (!oldString) return { error: 'old_string is empty. To create a file use write_file; to add text, include a nearby line in old_string.' };
  const count = content.split(oldString).length - 1;
  if (count > 1 && !replaceAll) {
    return { error: `old_string appears ${count} times. Add surrounding lines to make it unique, pass start_line/end_line, or set replace_all.`, count };
  }
  if (count >= 1) {
    return { content: replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, () => newString), mode: 'exact', count };
  }

  // Whitespace-normalised fallback: the same lines, indented differently
  // (blank lines between them don't count). A match starts on a line that
  // is the first wanted line, and the lines it covers are replaced, never
  // the same text found somewhere else (such as at the end of a line).
  const wanted = oldString.split('\n').map(l => l.trim()).filter(Boolean);
  if (wanted.length) {
    const lines = content.split('\n');
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== wanted[0]) continue;
      let j = 1;
      let k = i + 1;
      while (j < wanted.length && k < lines.length) {
        if (!lines[k].trim()) { k++; continue; }
        if (lines[k].trim() !== wanted[j]) break;
        j++; k++;
      }
      if (j === wanted.length) matches.push([i, k]);
    }
    if (matches.length === 1) {
      const [from, to] = matches[0];
      return { content: replaceLines(lines, from, to, newString, oldString), mode: 'fuzzy_whitespace', count: 1 };
    }
    if (matches.length > 1) {
      return { error: `old_string was not found exactly, and its lines with other whitespace appear ${matches.length} times. Copy the exact text from read_file, with enough lines to make it unique.`, count: matches.length };
    }
  }
  const closest = _findClosestLines(content, oldString, 3);
  return { error: 'old_string was not found. The file may have changed since you read it, or the text differs (whitespace, quotes): read it again and copy the exact text.', closest };
}

/** True when a JS/TS file parsed before an edit and doesn't after it. */
function syntaxBroken(filePath, before, after) {
  if (before !== null && !verifyJsSyntax(filePath, before).valid) return null;
  const check = verifyJsSyntax(filePath, after);
  return check.valid ? null : check.error;
}

export const editFileTool = {
  name: 'edit_file',
  description: 'Replace one exact piece of text in a file. old_string must match the file exactly (whitespace included) and appear once: add surrounding lines to make it unique, pass start_line/end_line to look only there, or set replace_all to change every occurrence. Read the file first. For several edits at once or a unified diff, use apply_patch; for a new file, write_file.',
  category: 'file',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to working directory' },
      old_string: { type: 'string', description: 'Exact text to replace, copied from read_file (unique in the file or the line range)' },
      new_string: { type: 'string', description: 'Text to put in its place (empty to delete it)' },
      replace_all: { type: 'boolean', description: 'Replace every occurrence (default false)' },
      start_line: { type: 'number', description: 'Optional: only look from this line (1-indexed)' },
      end_line: { type: 'number', description: 'Optional: only look up to this line (1-indexed, inclusive)' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  execute: async (args, context) => {
    const plan = planEdit(args, context.workingDir);
    if (plan.error) return { success: false, error: plan.error, ...plan.details };

    fs.writeFileSync(plan.filePath, plan.after, 'utf8');
    const broken = syntaxBroken(plan.filePath, plan.before, plan.after);
    return {
      success: true,
      path: args.path,
      replaced: args.replace_all === true ? plan.count : 1,
      ...(plan.lines ? { lines: plan.lines } : {}),
      ...(plan.mode === 'fuzzy_whitespace' ? { mode: plan.mode, warning: 'The exact text was not found, but the same lines with different whitespace were. Check the result with read_file.' } : {}),
      ...(broken ? { warning: `The file no longer parses: ${broken}` } : {}),
    };
  },
};

/**
 * Work out what edit_file would write, without writing anything:
 * { filePath, before, after, mode, count, lines? } or { error, details }.
 * The approval card's diff comes from here too, so what the user approves
 * is the change the tool makes (the line range and loose matches included).
 */
export function planEdit(args = {}, workingDir) {
  const filePath = safePath(args.path, workingDir);
  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${args.path}. Use write_file to create it.` };
  }
  if (fs.statSync(filePath).isDirectory()) return { error: `"${args.path}" is a directory, not a file.` };
  const content = fs.readFileSync(filePath, 'utf8');
  const oldString = String(args.old_string ?? '');
  const newString = String(args.new_string ?? '');
  const replaceAll = args.replace_all === true;

  if (args.start_line || args.end_line) {
    const lines = content.split('\n');
    const startLine = Math.max(1, Number(args.start_line) || 1);
    const endLine = Math.min(lines.length, Number(args.end_line) || lines.length);
    const region = lines.slice(startLine - 1, endLine).join('\n');
    const replaced = replaceText(region, oldString, newString, { replaceAll });
    if (replaced.error) {
      return { error: `Lines ${startLine}-${endLine}: ${replaced.error}`, details: { actual_content_in_range: region.slice(0, 500) } };
    }
    const after = [...lines.slice(0, startLine - 1), replaced.content, ...lines.slice(endLine)].join('\n');
    return { filePath, before: content, after, mode: replaced.mode, count: replaced.count, lines: `${startLine}-${endLine}` };
  }

  const replaced = replaceText(content, oldString, newString, { replaceAll });
  if (replaced.error) {
    return {
      error: replaced.error,
      details: {
        ...(replaced.count ? { occurrences: replaced.count } : {}),
        ...(replaced.closest?.length ? { closest_matches: replaced.closest } : {}),
      },
    };
  }
  return { filePath, before: content, after: replaced.content, mode: replaced.mode, count: replaced.count };
}

// ── apply_patch: several edits, all or nothing ───────────────────────────────

/** Where a diff's file lands: git-style a/ and b/ prefixes are dropped. */
function diffTarget(file, rawPath, strip, workingDir) {
  if (rawPath === null) return null;
  if (Number.isInteger(strip)) return stripComponents(rawPath, strip);
  const gitStyle = file.git || (/^a\//.test(file.oldPath || 'a/') && /^b\//.test(file.newPath || 'b/'));
  if (gitStyle && /^[ab]\//.test(rawPath)) return rawPath.slice(2);
  // "--- src/x.js" without prefixes, or a/ that is a real folder.
  try {
    if (!fs.existsSync(safePath(rawPath, workingDir)) && /^[ab]\//.test(rawPath)) return rawPath.slice(2);
  } catch { /* outside the folder: reported later */ }
  return rawPath;
}

function readIfFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  if (fs.statSync(filePath).isDirectory()) throw new Error('is a directory, not a file');
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Work out what apply_patch would write, without writing anything:
 * { changes: [{ path, filePath, before, after, from }] } (after null deletes
 * the file; from is the old path of a renamed one) or { error }.
 */
export function planPatch(args = {}, workingDir) {
  // Models that fill in every field send edits: [] beside a patch; an empty
  // list counts as not given.
  const edits = Array.isArray(args.edits) && args.edits.length ? args.edits : null;
  let patch = typeof args.patch === 'string' && args.patch.trim() ? args.patch : null;
  // Older diff_apply calls could point at a .diff file instead.
  if (!patch && typeof args.patch_path === 'string' && args.patch_path.trim()) {
    try {
      patch = fs.readFileSync(safePath(args.patch_path, workingDir), 'utf8');
    } catch (err) {
      return { error: `Could not read ${args.patch_path}: ${err.message}` };
    }
  }
  if (edits && patch) return { error: 'Pass edits or patch, not both.' };
  if (!edits && !patch) return { error: 'Pass edits (a list of { path, old_string, new_string }) or patch (a unified diff).' };

  const planned = new Map(); // path → { path, filePath, before, after, from }
  const current = (relPath) => {
    const filePath = safePath(relPath, workingDir);
    if (planned.has(filePath)) return planned.get(filePath);
    const before = readIfFile(filePath);
    const entry = { path: relPath, filePath, before, after: before };
    planned.set(filePath, entry);
    return entry;
  };

  try {
    if (edits) {
      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        if (!edit || typeof edit.path !== 'string' || typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') {
          return { error: `Edit ${i + 1} needs path, old_string and new_string (strings).` };
        }
        const entry = current(edit.path);
        if (entry.after === null) return { error: `Edit ${i + 1}: file not found: ${edit.path}. Use write_file to create it.` };
        const replaced = replaceText(entry.after, edit.old_string, edit.new_string, { replaceAll: edit.replace_all === true });
        if (replaced.error) return { error: `Edit ${i + 1} (${edit.path}): ${replaced.error}`, closest: replaced.closest };
        entry.after = replaced.content;
      }
    } else {
      const strip = Number.isInteger(args.strip) ? args.strip : null;
      const files = parseUnifiedDiff(patch);
      if (!files.length) return { error: 'No file changes found in the patch. It should look like `git diff` output: --- a/path, +++ b/path, then @@ hunks.' };
      for (const file of files) {
        const oldPath = diffTarget(file, file.oldPath, strip, workingDir);
        const newPath = diffTarget(file, file.newPath, strip, workingDir);
        const label = newPath || oldPath;
        if (oldPath === null) {
          const entry = current(newPath);
          if (entry.after !== null) return { error: `${newPath} already exists, but the patch creates it.` };
          entry.after = applyHunks('', file.hunks, { label: newPath });
          continue;
        }
        const entry = current(oldPath);
        if (entry.after === null) return { error: `File not found: ${oldPath}.` };
        const after = applyHunks(entry.after, file.hunks, { label });
        if (newPath === null) {
          entry.after = null;
        } else if (newPath !== oldPath) {
          const target = current(newPath);
          if (target.after !== null) return { error: `${newPath} already exists, but the patch renames ${oldPath} to it.` };
          target.after = after;
          target.from = oldPath;
          entry.after = null;
        } else {
          entry.after = after;
        }
      }
    }
  } catch (err) {
    return { error: err.message };
  }

  const changes = [...planned.values()].filter((entry) => entry.before !== entry.after);
  for (const change of changes) {
    if (change.after === null) continue;
    const broken = syntaxBroken(change.filePath, change.before, change.after);
    if (broken) return { error: `${change.path}: ${broken}` };
  }
  return { changes };
}

/** Existing files an apply_patch call would change (for read-before-write). */
export function patchTargets(args, workingDir) {
  try {
    const plan = planPatch(args, workingDir);
    return (plan.changes || []).filter((change) => change.before !== null).map((change) => change.path);
  } catch {
    return [];
  }
}

export const applyPatchTool = {
  name: 'apply_patch',
  description: 'Make several edits at once, in one file or many, all or nothing: pass edits (a list of exact replacements, each like edit_file) or patch (a unified diff, as git diff prints it; it can also create, delete and rename files). Everything is checked first: if any part does not apply, or a JS/TS file would stop parsing, no file changes. For a single replacement, edit_file is simpler.',
  category: 'file',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        description: 'Edits in order: [{ path, old_string, new_string, replace_all? }]. Each old_string must match exactly and be unique in its file when it is applied.',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to working directory' },
            old_string: { type: 'string', description: 'Exact text to replace' },
            new_string: { type: 'string', description: 'Text to put in its place (empty to delete it)' },
            replace_all: { type: 'boolean', description: 'Replace every occurrence (default false)' },
          },
          required: ['path', 'old_string', 'new_string'],
        },
      },
      patch: { type: 'string', description: 'A unified diff: --- a/path and +++ b/path headers, then @@ hunks with context lines. Use instead of edits.' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const plan = planPatch(args, context.workingDir);
    if (plan.error) {
      return { success: false, error: `${plan.error} No files were changed.`, ...(plan.closest?.length ? { closest_matches: plan.closest } : {}) };
    }
    const results = plan.changes.map((change) => ({
      path: change.path,
      action: change.after === null ? (plan.changes.some((c) => c.from === change.path) ? 'renamed' : 'deleted')
        : change.from ? `renamed from ${change.from}` : change.before === null ? 'created' : 'edited',
    }));
    if (args.dry_run) return { success: true, dry_run: true, files_changed: results.length, results, message: 'The patch applies; nothing was written.' };

    for (const change of plan.changes) {
      if (change.after === null) continue;
      fs.mkdirSync(path.dirname(change.filePath), { recursive: true });
      fs.writeFileSync(change.filePath, change.after, 'utf8');
    }
    for (const change of plan.changes) {
      if (change.after === null) fs.rmSync(change.filePath, { force: true });
    }
    return {
      success: true,
      files_changed: results.length,
      results,
      message: results.length ? `Changed ${results.length} file(s).` : 'Nothing to change: the files already look like that.',
    };
  },
};

export const searchFilesTool = {
  name: 'search_files',
  description: 'Search for text or regex patterns across files in the working directory. Similar to grep. Returns matching lines with file paths and line numbers.',
  category: 'file',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (text or regex)' },
      path: { type: 'string', description: 'Directory or file to search in (default: working directory)' },
      include: { type: 'string', description: 'File glob pattern to include, e.g. "*.js" or "*.py"' },
      max_results: { type: 'number', description: 'Maximum results to return (default: 30)' },
    },
    required: ['pattern'],
  },
  execute: async (args, context) => {
    const searchPath = safePath(args.path || '.', context.workingDir);
    const max = clampInt(args.max_results, 30, 1, 80);

    // Programs run with argument lists (no shell): the pattern, glob and
    // path all come from the model.
    const pattern = String(args.pattern ?? '');
    let run;
    if (hasBin('rg')) {
      run = runFile('rg', [
        '--no-heading', '--line-number', '--max-count', max,
        ...(args.include ? ['--glob', String(args.include)] : []),
        '-e', pattern, '--', searchPath,
      ], { cwd: context.workingDir, timeout: 15000 });
    } else {
      run = runFile('grep', [
        '-rnI', ...(args.include ? [`--include=${args.include}`] : []), `--max-count=${max}`,
        '-e', pattern, '--', searchPath,
      ], { cwd: context.workingDir, timeout: 15000 });
    }

    try {
      // rg and grep exit 1 when nothing matches.
      if (!run.ok && run.status !== 1) throw new Error(run.error);
      const output = firstLines(run.stdout, max);
      const rawLines = output.trim().split('\n').filter(Boolean);

      // Parse results into structured objects for better agent consumption
      const results = rawLines.map(line => {
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          return {
            file: path.relative(context.workingDir, match[1]) || match[1],
            line: parseInt(match[2], 10),
            content: match[3].trim().slice(0, 200),
          };
        }
        return { file: '?', line: 0, content: line.slice(0, 200) };
      });

      return {
        success: true,
        pattern: args.pattern,
        matches: results.length,
        results,
        // Also include raw text for backward compat / direct reading
        raw: truncate(rawLines.join('\n'), 10000),
      };
    } catch (err) {
      if (err.status === 1) return { success: true, pattern: args.pattern, matches: 0, results: [], raw: 'No matches found.' };
      return { success: false, error: err.message };
    }
  },
};

export const listDirectoryTool = {
  name: 'list_directory',
  description: 'List files and directories at the given path. Shows file names, types, and sizes.',
  category: 'file',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path relative to working directory (default: ".")' },
      recursive: { type: 'boolean', description: 'List recursively (default: false, max depth 3)' },
      max_entries: { type: 'number', description: 'Maximum entries to return (default: 80, max 120)' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const dirPath = safePath(args.path || '.', context.workingDir);
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: `Directory not found: ${args.path || '.'}` };
    }
    if (!fs.statSync(dirPath).isDirectory()) {
      return { success: false, error: `"${args.path}" is a file, not a directory. Use read_file instead.` };
    }

    const entries = [];
    const maxEntries = Math.min(Math.max(Number(args.max_entries || 80), 1), 120);

    function listDir(dir, depth = 0) {
      if (entries.length >= maxEntries) return;
      if (depth > (args.recursive ? 3 : 0)) return;

      const items = fs.readdirSync(dir).filter(n => !n.startsWith('.') && n !== 'node_modules' && n !== '__pycache__');
      items.sort();

      for (const item of items) {
        if (entries.length >= maxEntries) break;
        const fullPath = path.join(dir, item);
        const relPath = path.relative(context.workingDir, fullPath);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            entries.push({ name: relPath + '/', type: 'dir' });
            if (args.recursive) listDir(fullPath, depth + 1);
          } else {
            entries.push({
              name: relPath,
              type: 'file',
              size: stat.size < 1024 ? `${stat.size}B` : stat.size < 1048576 ? `${(stat.size / 1024).toFixed(1)}KB` : `${(stat.size / 1048576).toFixed(1)}MB`,
            });
          }
        } catch { /* permission error, skip */ }
      }
    }

    listDir(dirPath);
    const display = entries.map(e => e.type === 'dir' ? `📁 ${e.name}` : `📄 ${e.name} (${e.size})`).join('\n');
    return {
      success: true,
      path: args.path || '.',
      count: entries.length,
      truncated: entries.length >= maxEntries,
      listing: truncate(display, 5000),
      note: entries.length >= maxEntries ? `Listing capped at ${maxEntries} entries. Use a narrower path or max_entries for more control.` : undefined,
    };
  },
};

export const findFilesTool = {
  name: 'find_files',
  description: 'Find files by name or extension pattern. Searches recursively through the working directory.',
  category: 'file',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'File name pattern, e.g. "*.py", "index.*", "README*"' },
      path: { type: 'string', description: 'Directory to search in (default: working directory)' },
    },
    required: ['pattern'],
  },
  execute: async (args, context) => {
    const searchPath = safePath(args.path || '.', context.workingDir);

    try {
      const run = runFile('find', [
        searchPath, '-name', String(args.pattern ?? ''),
        '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*', '-not', '-path', '*/__pycache__/*',
      ], { timeout: 10000 });
      const output = firstLines(run.stdout, 50);
      const files = output.trim().split('\n').filter(Boolean).map(f => path.relative(context.workingDir, f));
      return {
        success: true,
        pattern: args.pattern,
        count: files.length,
        files: files.join('\n') || 'No files found.',
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const fileDiffTool = {
  name: 'file_diff',
  description: 'Compare two files or a file with git to see what changed. Shows additions (+), deletions (-), and line numbers. Use before committing or when reviewing changes.',
  category: 'file',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file (relative to working directory)' },
      compare_to: { type: 'string', description: 'Optional: compare against this path instead of git HEAD' },
      context_lines: { type: 'number', description: 'Number of context lines to show (default: 3)' },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${args.path}` };
    }

    try {
      // Programs run with argument lists, not a shell: file names inside the
      // folder can contain $(...) or quotes.
      const run = (file, argv) => {
        const res = runFile(file, argv, { cwd: context.workingDir, timeout: 10000 });
        // diff exits 1 when the files differ; only a failure to run is null.
        return res.status === null ? null : res.stdout;
      };
      let output;
      if (args.compare_to) {
        const comparePath = safePath(args.compare_to, context.workingDir);
        output = run('diff', ['-u', '--', comparePath, filePath]) ?? '';
      } else {
        const cl = Math.min(Math.max(Number.parseInt(args.context_lines, 10) || 3, 0), 50);
        output = run('git', ['diff', '--no-color', `-U${cl}`, '--', filePath])
          || run('diff', ['-u', '/dev/null', filePath])
          || 'No git repo and no compare_to specified';
      }
      if (!output.trim()) return { success: true, path: args.path, diff: '(no changes)', changes: 0 };

      const added = (output.match(/^\+[^+]/g) || []).length;
      const removed = (output.match(/^-[^-]/g) || []).length;
      return {
        success: true,
        path: args.path,
        diff: truncate(output, 8000),
        additions: added,
        deletions: removed,
        changes: added + removed,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const globFindTool = {
  name: 'glob_find',
  description: 'Find files using glob patterns (like find_files but with full glob support: **/*.js, src/**/*.ts, etc.). Searches recursively.',
  category: 'file',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.js", "src/**/*.ts", "test/**/*.py"' },
      path: { type: 'string', description: 'Directory to search in (default: working directory)' },
      max_results: { type: 'number', description: 'Maximum files to return (default: 100)' },
    },
    required: ['pattern'],
  },
  execute: async (args, context) => {
    const searchPath = safePath(args.path || '.', context.workingDir);
    const max = clampInt(args.max_results, 100, 1, 500);
    const pattern = String(args.pattern ?? '');

    try {
      // Use fd if available (fast, respects gitignore), otherwise find.
      // Both run with argument lists, not a shell.
      let run;
      if (hasBin('fd')) {
        run = runFile('fd', ['--type', 'f', '--glob', pattern, searchPath], { timeout: 15000 });
      } else {
        // **/*.js → -name '*.js'
        run = runFile('find', [
          searchPath, '-path', '*/node_modules', '-prune', '-o', '-path', '*/.git', '-prune', '-o',
          '-name', path.basename(pattern), '-print',
        ], { timeout: 15000 });
      }
      const output = firstLines(run.stdout, max);
      const files = output.trim().split('\n').filter(Boolean).map(f => path.relative(context.workingDir, f));
      return {
        success: true,
        pattern: args.pattern,
        count: files.length,
        files: files.join('\n') || 'No files found.',
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const fileCopyTool = {
  name: 'file_copy',
  description: 'Copy a file or directory to a destination. Creates parent directories if needed.',
  category: 'file',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Source path (relative to working directory)' },
      destination: { type: 'string', description: 'Destination path (relative to working directory)' },
    },
    required: ['source', 'destination'],
  },
  execute: async (args, context) => {
    const src = safePath(args.source, context.workingDir);
    const dst = safePath(args.destination, context.workingDir);
    if (!fs.existsSync(src)) {
      return { success: false, error: `Source not found: ${args.source}` };
    }

    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      if (fs.statSync(src).isDirectory()) {
        return { success: false, error: 'Use list_directory recursive to copy directories, or specify individual files.' };
      }
      fs.copyFileSync(src, dst);
      const stat = fs.statSync(dst);
      return { success: true, source: args.source, destination: args.destination, size_bytes: stat.size };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const fileMoveTool = {
  name: 'file_move',
  description: 'Move or rename a file or directory.',
  category: 'file',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Source path (relative to working directory)' },
      destination: { type: 'string', description: 'Destination path (relative to working directory)' },
    },
    required: ['source', 'destination'],
  },
  execute: async (args, context) => {
    const src = safePath(args.source, context.workingDir);
    const dst = safePath(args.destination, context.workingDir);
    if (!fs.existsSync(src)) {
      return { success: false, error: `Source not found: ${args.source}` };
    }

    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.renameSync(src, dst);
      return { success: true, source: args.source, destination: args.destination, action: 'moved' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const fileDeleteTool = {
  name: 'file_delete',
  description: 'Delete a file. For directories, you must specify recursive=true. Shows confirmation info before deletion.',
  category: 'file',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to delete (relative to working directory)' },
      recursive: { type: 'boolean', description: 'Delete directory and all contents (default: false)' },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const targetPath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `Path not found: ${args.path}` };
    }

    try {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory() && !args.recursive) {
        return { success: false, error: 'Path is a directory. Use recursive=true to delete directories.' };
      }
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true });
      } else {
        fs.unlinkSync(targetPath);
      }
      return { success: true, path: args.path, action: 'deleted' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const fileWatchTool = {
  name: 'file_watch',
  description: 'Watch a file for changes. Returns the current content and starts watching. When the file changes, you will be notified on the next call. Note: watching is per-request only.',
  category: 'file',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to watch (relative to working directory)' },
      poll_interval_ms: { type: 'number', description: 'How often to check for changes in ms (default: 2000)' },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${args.path}` };
    }

    const stat = fs.statSync(filePath);
    const mtime = stat.mtime.toISOString();
    const content = fs.readFileSync(filePath, 'utf8').slice(0, 4000);
    const lines = content.split('\n').length;

    return {
      success: true,
      path: args.path,
      last_modified: mtime,
      current_content_preview: content.slice(0, 500) + (content.length > 500 ? '...' : ''),
      total_lines: lines,
      note: 'Call file_watch again after other operations to check if the file has changed.',
    };
  },
};

/** All file tools for batch registration. */
export const fileTools = [
  readFileTool, writeFileTool, createDirectoryTool, editFileTool, applyPatchTool, searchFilesTool,
  listDirectoryTool, findFilesTool, fileDiffTool, globFindTool,
  fileCopyTool, fileMoveTool, fileDeleteTool, fileWatchTool,
];
export default fileTools;
