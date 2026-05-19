// den/src/agent/tools/fileTools.js
// ─── File System Tools ───────────────────────────────────────────────────────
// read, write, edit, search, list files in the agent's working directory.
// All paths are resolved relative to the working directory and sandboxed.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PermissionLevel } from './toolRegistry.js';
import { safePath, truncate } from './shared.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

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
      ...(existed ? { warning: 'File was overwritten. If you intended a partial edit, use edit_file or patch_file instead.' } : {}),
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

export const editFileTool = {
  name: 'edit_file',
  description: 'Replace specific content in a file. Provide the exact text to find and its replacement. Use read_file first to see the current content. Optionally provide start_line/end_line to restrict the search to a line range (1-indexed, inclusive) — useful when the find text appears multiple times.',
  category: 'file',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to working directory' },
      find: { type: 'string', description: 'Exact text to find (must match exactly including whitespace)' },
      replace: { type: 'string', description: 'Replacement text' },
      start_line: { type: 'number', description: 'Optional: restrict search to lines starting from this line (1-indexed)' },
      end_line: { type: 'number', description: 'Optional: restrict search to lines ending at this line (1-indexed, inclusive)' },
    },
    required: ['path', 'find', 'replace'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${args.path}` };
    }
    const content = fs.readFileSync(filePath, 'utf8');

    // Line-range mode: if start_line/end_line provided, search within that range
    if (args.start_line || args.end_line) {
      const lines = content.split('\n');
      const startLine = Math.max(1, args.start_line || 1);
      const endLine = Math.min(lines.length, args.end_line || lines.length);
      const rangeContent = lines.slice(startLine - 1, endLine).join('\n');
      if (!rangeContent.includes(args.find)) {
        return {
          success: false,
          error: `The "find" text was not found in lines ${startLine}-${endLine}.`,
          actual_content_in_range: rangeContent.slice(0, 500),
          suggestion: 'Re-read the file and check the exact content within the specified line range.',
        };
      }
      const newRange = rangeContent.replace(args.find, args.replace);
      const newLines = [...lines.slice(0, startLine - 1), ...newRange.split('\n'), ...lines.slice(endLine)];
      fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
      return {
        success: true,
        path: args.path,
        message: `Replacement applied within lines ${startLine}-${endLine}.`,
        mode: 'line_range',
      };
    }

    // Standard exact-match mode
    if (content.includes(args.find)) {
      const count = content.split(args.find).length - 1;
      const newContent = content.replace(args.find, args.replace);
      fs.writeFileSync(filePath, newContent, 'utf8');
      return {
        success: true,
        path: args.path,
        occurrences_found: count,
        occurrences_replaced: 1,
        message: count > 1 ? `Replaced first occurrence (${count} total found). Call again to replace more.` : 'Replacement applied.',
      };
    }

    // Fuzzy fallback: try whitespace-normalized matching
    const normalizeWS = s => s.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n').trim();
    const normalizedContent = normalizeWS(content);
    const normalizedFind = normalizeWS(args.find);
    if (normalizedFind.length > 0 && normalizedContent.includes(normalizedFind)) {
      // Find the original substring that matches after normalization
      const lines = content.split('\n');
      const findLines = args.find.split('\n').map(l => l.trim()).filter(Boolean);
      if (findLines.length > 0) {
        // Find the first line in the file that matches the first find line
        let matchStart = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim() === findLines[0]) {
            // Check if subsequent lines also match
            let allMatch = true;
            for (let j = 1; j < findLines.length && i + j < lines.length; j++) {
              if (lines[i + j].trim() !== findLines[j]) { allMatch = false; break; }
            }
            if (allMatch) { matchStart = i; break; }
          }
        }
        if (matchStart >= 0) {
          const originalBlock = lines.slice(matchStart, matchStart + findLines.length).join('\n');
          const newContent = content.replace(originalBlock, args.replace);
          fs.writeFileSync(filePath, newContent, 'utf8');
          return {
            success: true,
            path: args.path,
            message: 'Replacement applied (fuzzy whitespace match).',
            mode: 'fuzzy_whitespace',
            warning: 'The exact text was not found but a whitespace-normalized match was. Verify the result with read_file.',
          };
        }
      }
    }

    // Find closest matching lines for the error message
    const closestMatches = _findClosestLines(content, args.find, 3);
    return {
      success: false,
      error: 'The "find" text was not found in the file. Make sure it matches exactly (including whitespace and newlines).',
      closest_matches: closestMatches.length > 0 ? closestMatches : undefined,
      suggestion: closestMatches.length > 0
        ? 'The closest matching content is shown above. Re-read the file with read_file and use the exact content.'
        : 'Re-read the file with read_file to see its current content.',
    };
  },
};

export const patchFileTool = {
  name: 'patch_file',
  description: 'Precisely replace an exact string in a file using old_string → new_string semantics. old_string must match exactly (including whitespace and newlines) and must appear exactly once in the file — this prevents ambiguous replacements. If old_string appears more than once, provide more surrounding context to make it unique. Prefer this over edit_file for reliable, targeted edits.',
  category: 'file',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to working directory' },
      old_string: { type: 'string', description: 'Exact text to find — must appear exactly once in the file' },
      new_string: { type: 'string', description: 'Text to replace it with' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${args.path}` };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const count = content.split(args.old_string).length - 1;
    if (count === 0) {
      // Try fuzzy whitespace-normalized match before failing
      const normalizeWS = s => s.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n').trim();
      const normalizedContent = normalizeWS(content);
      const normalizedOld = normalizeWS(args.old_string);
      if (normalizedOld.length > 0 && normalizedContent.includes(normalizedOld)) {
        const lines = content.split('\n');
        const oldLines = args.old_string.split('\n').map(l => l.trim()).filter(Boolean);
        if (oldLines.length > 0) {
          let matchStart = -1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === oldLines[0]) {
              let allMatch = true;
              for (let j = 1; j < oldLines.length && i + j < lines.length; j++) {
                if (lines[i + j].trim() !== oldLines[j]) { allMatch = false; break; }
              }
              if (allMatch) { matchStart = i; break; }
            }
          }
          if (matchStart >= 0) {
            const originalBlock = lines.slice(matchStart, matchStart + oldLines.length).join('\n');
            // Check uniqueness of the fuzzy match
            const fuzzyCount = content.split(originalBlock).length - 1;
            if (fuzzyCount === 1) {
              const newContent = content.replace(originalBlock, args.new_string);
              fs.writeFileSync(filePath, newContent, 'utf8');
              return {
                success: true,
                path: args.path,
                message: 'Replacement applied (fuzzy whitespace match).',
                mode: 'fuzzy_whitespace',
                warning: 'Exact match failed but whitespace-normalized match succeeded. Verify with read_file.',
              };
            }
          }
        }
      }

      // Find closest matches for helpful error
      const closestMatches = _findClosestLines(content, args.old_string, 3);
      return {
        success: false,
        error: `old_string not found in file. It may have changed since you last read it — call read_file first to see the current content.`,
        closest_matches: closestMatches.length > 0 ? closestMatches : undefined,
        suggestion: closestMatches.length > 0
          ? 'The closest matching content is shown above. Use the exact text from the file.'
          : undefined,
      };
    }
    if (count > 1) {
      return {
        success: false,
        error: `old_string appears ${count} times in the file — it must be unique. Add more surrounding lines to make it unambiguous.`,
        occurrences: count,
      };
    }
    const newContent = content.replace(args.old_string, args.new_string);
    fs.writeFileSync(filePath, newContent, 'utf8');
    return {
      success: true,
      path: args.path,
      message: 'Replacement applied.',
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
    const max = Math.min(args.max_results || 30, 80);

    // Try ripgrep first, fall back to grep
    let cmd;
    const escapedPattern = args.pattern.replace(/'/g, "'\\''");
    const includeFlag = args.include ? `--include='${args.include}'` : '';

    try {
      // Check if rg (ripgrep) is available
      execSync('which rg', { stdio: 'ignore' });
      const rgInclude = args.include ? `--glob '${args.include}'` : '';
      cmd = `rg --no-heading --line-number --max-count ${max} ${rgInclude} -e '${escapedPattern}' '${searchPath}' 2>/dev/null | head -${max}`;
    } catch {
      cmd = `grep -rnI ${includeFlag} --max-count=${max} '${escapedPattern}' '${searchPath}' 2>/dev/null | head -${max}`;
    }

    try {
      const output = execSync(cmd, { cwd: context.workingDir, encoding: 'utf8', timeout: 15000, maxBuffer: 512 * 1024 });
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
    const escapedPattern = args.pattern.replace(/'/g, "'\\''");

    try {
      const cmd = `find '${searchPath}' -name '${escapedPattern}' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/__pycache__/*' 2>/dev/null | head -50`;
      const output = execSync(cmd, { encoding: 'utf8', timeout: 10000 });
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
      let output;
      if (args.compare_to) {
        const comparePath = safePath(args.compare_to, context.workingDir);
        output = execSync(`diff -u "${comparePath}" "${filePath}" 2>/dev/null || true`, { encoding: 'utf8', timeout: 10000 });
      } else {
        const cl = args.context_lines || 3;
        output = execSync(`git diff --no-color -U ${cl} -- "${filePath}" 2>/dev/null || diff -u /dev/null "${filePath}" 2>/dev/null || echo "No git repo and no compare_to specified"`, { cwd: context.workingDir, encoding: 'utf8', timeout: 10000 });
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
    const max = args.max_results || 100;
    const pattern = args.pattern;

    try {
      // Use fd if available (fast, respects gitignore), otherwise find
      let cmd;
      try {
        execSync('which fd', { stdio: 'ignore' });
        const escaped = pattern.replace(/'/g, "'\\''");
        cmd = `fd --type f --glob '${escaped}' '${searchPath}' 2>/dev/null | head -${max}`;
      } catch {
        // Fallback: convert simple glob to find pattern
        // **/*.js → -name '*.js', src/**/*.ts → -path '*/src/**/*.ts'
        const basename = path.basename(pattern);
        const escaped = basename.replace(/'/g, "'\\''");
        cmd = `find '${searchPath}' -path '*/node_modules' -prune -o -path '*/.git' -prune -o -name '${escaped}' -print 2>/dev/null | head -${max}`;
      }
      const output = execSync(cmd, { encoding: 'utf8', timeout: 15000 });
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
  readFileTool, writeFileTool, createDirectoryTool, editFileTool, patchFileTool, searchFilesTool,
  listDirectoryTool, findFilesTool, fileDiffTool, globFindTool,
  fileCopyTool, fileMoveTool, fileDeleteTool, fileWatchTool,
];
export default fileTools;
