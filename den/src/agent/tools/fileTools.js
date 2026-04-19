// den/src/agent/tools/fileTools.js
// ─── File System Tools ───────────────────────────────────────────────────────
// read, write, edit, search, list files in the agent's working directory.
// All paths are resolved relative to the working directory and sandboxed.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PermissionLevel } from './toolRegistry.js';

/** Resolve a path safely within the working directory. Prevents path traversal. */
function safePath(filePath, workingDir) {
  const resolved = path.resolve(workingDir, filePath);
  if (!resolved.startsWith(path.resolve(workingDir))) {
    throw new Error(`Path "${filePath}" is outside the working directory`);
  }
  return resolved;
}

/** Truncate content for display in tool results. */
function truncate(str, maxLen = 8000) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `\n\n... [truncated, ${str.length - maxLen} more chars]`;
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
    return {
      success: true,
      path: args.path,
      total_lines: lines.length,
      showing: `${start}-${end}`,
      content: truncate(numbered),
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
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, args.content, 'utf8');
    const lines = args.content.split('\n').length;
    return {
      success: true,
      path: args.path,
      action: existed ? 'overwritten' : 'created',
      lines,
      bytes: Buffer.byteLength(args.content, 'utf8'),
    };
  },
};

export const editFileTool = {
  name: 'edit_file',
  description: 'Replace specific content in a file. Provide the exact text to find and its replacement. Use read_file first to see the current content.',
  category: 'file',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to working directory' },
      find: { type: 'string', description: 'Exact text to find (must match exactly including whitespace)' },
      replace: { type: 'string', description: 'Replacement text' },
    },
    required: ['path', 'find', 'replace'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${args.path}` };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes(args.find)) {
      return { success: false, error: 'The "find" text was not found in the file. Make sure it matches exactly (including whitespace and newlines).' };
    }
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
    const max = args.max_results || 30;

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
      const lines = output.trim().split('\n').filter(Boolean);
      return {
        success: true,
        pattern: args.pattern,
        matches: lines.length,
        results: truncate(lines.join('\n'), 6000),
      };
    } catch (err) {
      if (err.status === 1) return { success: true, pattern: args.pattern, matches: 0, results: 'No matches found.' };
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
    const maxEntries = 200;

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
      listing: display,
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

/** All file tools for batch registration. */
export const fileTools = [readFileTool, writeFileTool, editFileTool, searchFilesTool, listDirectoryTool, findFilesTool];
export default fileTools;
