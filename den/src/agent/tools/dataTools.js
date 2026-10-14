// den/src/agent/tools/dataTools.js
// ─── Data & File Format Tools ────────────────────────────────────────────────
// read_pdf, read_csv, write_csv, zip_files, unzip_files, json_query,
// inspect_attachment, image_describe

import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PermissionLevel } from './toolRegistry.js';
import { clampInt, hasBin, missingDepError, runFile } from './shared.js';
import { getStatus as getWhisperStatus, transcribe } from '../../ai/controllers/ai/whisperServerManager.js';

const PLATFORM = os.platform();
const IS_WIN   = PLATFORM === 'win32';
const TEXT_EXTS = new Set(['txt', 'md', 'mdx', 'json', 'csv', 'tsv', 'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'sql', 'yaml', 'yml', 'toml', 'ini', 'env', 'log', 'sh', 'bash', 'zsh']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const AUDIO_EXTS = new Set(['wav', 'mp3', 'ogg', 'flac', 'm4a', 'webm']);



function safePath(filePath, workingDir, workspaceRoot = workingDir) {
  const roots = [workingDir, workspaceRoot]
    .filter(Boolean)
    .map(root => path.resolve(root));
  const candidates = path.isAbsolute(filePath)
    ? [path.resolve(filePath)]
    : roots.map(root => path.resolve(root, filePath));
  const resolved = candidates.find(candidate =>
    roots.some(root => candidate === root || candidate.startsWith(root + path.sep)) &&
    fs.existsSync(candidate)
  ) || candidates[0];
  const allowed = roots.some(root => resolved === root || resolved.startsWith(root + path.sep));
  if (!allowed) {
    throw new Error(`Path "${filePath}" is outside the working directory`);
  }
  return resolved;
}

function fileKind(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return { kind: 'image', ext };
  if (AUDIO_EXTS.has(ext)) return { kind: 'audio', ext };
  if (ext === 'pdf') return { kind: 'pdf', ext };
  if (TEXT_EXTS.has(ext) || !ext) return { kind: 'text', ext };
  return { kind: 'binary', ext };
}

// Runs a program with an argument list, never through a shell: file names and
// options come from the model.
function runProc(file, argv, opts = {}) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '';
    const proc = spawn(file, argv.map(String), { cwd: opts.cwd || process.cwd(), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { proc.kill(); resolve({ success: false, error: `Timed out after ${(opts.timeout || 30000) / 1000}s`, stdout, stderr }); }, opts.timeout || 30000);
    proc.stdout?.on('data', d => { stdout += d.toString(); });
    proc.stderr?.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => { clearTimeout(timer); resolve({ success: code === 0, exit_code: code, stdout: stdout.trim(), stderr: stderr.trim() }); });
    proc.on('error', err => { clearTimeout(timer); resolve({ success: false, error: err.message }); });
  });
}

// ── read_pdf ─────────────────────────────────────────────────────────────────
export const readPdfTool = {
  name: 'read_pdf',
  description: 'Extract text from a PDF file. Requires pdftotext (Linux: sudo apt install poppler-utils | Mac: brew install poppler | Windows: install poppler for Windows). Returns plain text content.',
  category: 'data',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path:       { type: 'string', description: 'Path to PDF file (relative to working directory)' },
      pages:      { type: 'string', description: 'Page range e.g. "1-5" or "3" (optional, default: all)' },
      layout:     { type: 'boolean', description: 'Preserve layout with whitespace (default: false)' },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir, context.workspaceRoot);
    if (!fs.existsSync(filePath)) return { success: false, error: `File not found: ${args.path}` };
    if (!filePath.endsWith('.pdf') && !filePath.toLowerCase().endsWith('.pdf')) {
      return { success: false, error: 'File does not appear to be a PDF.' };
    }

    if (!hasBin('pdftotext')) {
      return {
        success: false,
        error: missingDepError('pdftotext', 'macOS: brew install poppler | Linux: sudo apt install poppler-utils | Windows: install poppler from https://github.com/oschwartz10612/poppler-windows/releases'),
        install: IS_WIN ? 'Download poppler for Windows: https://github.com/oschwartz10612/poppler-windows/releases'
          : PLATFORM === 'darwin' ? 'brew install poppler'
          : 'sudo apt install poppler-utils',
      };
    }

    try {
      // Page numbers are parsed, and pdftotext runs with an argument list.
      const [firstPage, lastPage] = String(args.pages || '').split('-').map((n) => Number.parseInt(n, 10));
      const pageArgs = Number.isFinite(firstPage)
        ? ['-f', firstPage, '-l', Number.isFinite(lastPage) ? lastPage : firstPage]
        : [];
      const tmpOut = path.join(os.tmpdir(), `asyncat_pdf_${Date.now()}.txt`);
      const res = runFile('pdftotext', [...pageArgs, ...(args.layout ? ['-layout'] : []), filePath, tmpOut], { timeout: 30000 });
      if (!res.ok && !fs.existsSync(tmpOut)) throw new Error(res.error);
      let text = fs.readFileSync(tmpOut, 'utf8');
      try { fs.unlinkSync(tmpOut); } catch {}
      if (text.length > 12000) text = text.slice(0, 12000) + '\n... [truncated]';
      return { success: true, path: args.path, chars: text.length, content: text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── read_csv ─────────────────────────────────────────────────────────────────
export const readCsvTool = {
  name: 'read_csv',
  description: 'Read a CSV file and return its contents as structured rows. Returns column headers and data rows. Supports quoted fields and commas within fields.',
  category: 'data',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path:       { type: 'string', description: 'Path to CSV file (relative to working directory)' },
      limit:      { type: 'number', description: 'Max rows to return (default: 100)' },
      delimiter:  { type: 'string', description: 'Field delimiter (default: ","' },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir, context.workspaceRoot);
    if (!fs.existsSync(filePath)) return { success: false, error: `File not found: ${args.path}` };

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const delim = args.delimiter || ',';
      const limit = args.limit || 100;

      // Parse CSV handling quoted fields
      function parseLine(line) {
        const fields = [];
        let cur = '', inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
            else { inQuote = !inQuote; }
          } else if (ch === delim && !inQuote) {
            fields.push(cur.trim()); cur = '';
          } else {
            cur += ch;
          }
        }
        fields.push(cur.trim());
        return fields;
      }

      const lines = raw.split('\n').filter(l => l.trim());
      const headers = parseLine(lines[0]);
      const rows = lines.slice(1, limit + 1).map(line => {
        const vals = parseLine(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
        return obj;
      });

      return {
        success: true,
        path: args.path,
        total_lines: lines.length - 1,
        returned: rows.length,
        headers,
        rows,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── write_csv ─────────────────────────────────────────────────────────────────
export const writeCsvTool = {
  name: 'write_csv',
  description: 'Write data to a CSV file. Accepts an array of objects (rows) and writes them with a header row derived from object keys.',
  category: 'data',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path:      { type: 'string', description: 'Output path (relative to working directory)' },
      rows:      { type: 'array',  description: 'Array of objects to write. Keys become column headers.' },
      delimiter: { type: 'string', description: 'Field delimiter (default: ",")' },
      append:    { type: 'boolean', description: 'Append to file instead of overwrite (default: false)' },
    },
    required: ['path', 'rows'],
  },
  execute: async (args, context) => {
    const filePath = path.resolve(context.workingDir, args.path);
    if (!args.rows || !Array.isArray(args.rows) || args.rows.length === 0) {
      return { success: false, error: 'rows must be a non-empty array.' };
    }

    const delim = args.delimiter || ',';
    const escape = (v) => {
      const s = String(v ?? '');
      return s.includes(delim) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    try {
      const headers = Object.keys(args.rows[0]);
      const headerLine = headers.map(escape).join(delim);
      const dataLines = args.rows.map(row => headers.map(h => escape(row[h])).join(delim));
      const content = [headerLine, ...dataLines].join('\n') + '\n';

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      if (args.append && fs.existsSync(filePath)) {
        fs.appendFileSync(filePath, dataLines.join('\n') + '\n', 'utf8');
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
      }

      return { success: true, path: args.path, rows_written: args.rows.length, headers, action: args.append ? 'appended' : 'created' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── zip_files ─────────────────────────────────────────────────────────────────
export const zipFilesTool = {
  name: 'zip_files',
  description: 'Compress files or directories into a ZIP archive. Cross-platform.',
  category: 'data',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      output:  { type: 'string', description: 'Output ZIP file path (relative to working directory)' },
      sources: { type: 'array',  items: { type: 'string' }, description: 'Files/directories to include (relative to working directory)' },
    },
    required: ['output', 'sources'],
  },
  execute: async (args, context) => {
    const outPath = safePath(args.output, context.workingDir);
    const sources = args.sources.map(s => safePath(s, context.workingDir));

    for (const src of sources) {
      if (!fs.existsSync(src)) return { success: false, error: `Source not found: ${src}` };
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    try {
      let result;
      if (IS_WIN) {
        const srcList = sources.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
        const ps = `Compress-Archive -Path ${srcList} -DestinationPath '${outPath.replace(/'/g, "''")}' -Force`;
        result = await runProc('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { cwd: context.workingDir, timeout: 60000 });
      } else {
        result = await runProc('zip', ['-r', outPath, '--', ...sources], { cwd: context.workingDir, timeout: 60000 });
      }
      if (!result.success) return { success: false, error: result.stderr || result.error };
      const stat = fs.existsSync(outPath) ? fs.statSync(outPath) : null;
      return { success: true, output: args.output, size_bytes: stat?.size || 0, sources: args.sources };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── unzip_files ───────────────────────────────────────────────────────────────
export const unzipFilesTool = {
  name: 'unzip_files',
  description: 'Extract a ZIP archive to a destination directory. Cross-platform.',
  category: 'data',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      source:      { type: 'string', description: 'ZIP file to extract (relative to working directory)' },
      destination: { type: 'string', description: 'Directory to extract into (default: same name as zip, no extension)' },
    },
    required: ['source'],
  },
  execute: async (args, context) => {
    const srcPath = safePath(args.source, context.workingDir);
    if (!fs.existsSync(srcPath)) return { success: false, error: `File not found: ${args.source}` };

    const destPath = safePath(args.destination || path.basename(args.source, '.zip'), context.workingDir);
    fs.mkdirSync(destPath, { recursive: true });

    try {
      let result;
      if (IS_WIN) {
        const ps = `Expand-Archive -Path '${srcPath.replace(/'/g, "''")}' -DestinationPath '${destPath.replace(/'/g, "''")}' -Force`;
        result = await runProc('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { cwd: context.workingDir, timeout: 60000 });
      } else {
        result = await runProc('unzip', ['-o', srcPath, '-d', destPath], { cwd: context.workingDir, timeout: 60000 });
      }
      if (!result.success && result.exit_code !== 1) return { success: false, error: result.stderr || result.error };
      return { success: true, source: args.source, destination: destPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── json_query ────────────────────────────────────────────────────────────────
export const jsonQueryTool = {
  name: 'json_query',
  description: 'Query or transform JSON data using jq syntax (if jq is installed) or a dot-path accessor. Use to extract fields from API responses, JSON files, or structured data. Examples: ".name", ".users[0].email", ".items | length".',
  category: 'data',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path:    { type: 'string', description: 'Path to JSON file (relative to working directory). Omit to use inline data.' },
      data:    { type: 'object', description: 'Inline JSON data to query (use instead of path).' },
      query:   { type: 'string', description: 'jq expression or dot-path, e.g. ".name", ".users[0].email"' },
    },
    required: ['query'],
  },
  execute: async (args, context) => {
    let jsonData;
    try {
      if (args.path) {
        const filePath = path.resolve(context.workingDir, args.path);
        if (!fs.existsSync(filePath)) return { success: false, error: `File not found: ${args.path}` };
        jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else if (args.data !== undefined) {
        jsonData = args.data;
      } else {
        return { success: false, error: 'Provide either path or data.' };
      }
    } catch (err) {
      return { success: false, error: `JSON parse error: ${err.message}` };
    }

    // Try jq first (much more powerful)
    if (hasBin('jq')) {
      try {
        const tmpIn = path.join(os.tmpdir(), `asyncat_jq_${Date.now()}.json`);
        fs.writeFileSync(tmpIn, JSON.stringify(jsonData), 'utf8');
        // Pass the jq program and the file as separate argv entries (no shell),
        // so the query is handed to jq verbatim instead of to /bin/sh.
        let out;
        try {
          out = execFileSync('jq', [String(args.query), tmpIn], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
        } finally {
          try { fs.unlinkSync(tmpIn); } catch {}
        }
        let result;
        try { result = JSON.parse(out); } catch { result = out.trim(); }
        return { success: true, engine: 'jq', query: args.query, result };
      } catch (err) {
        return { success: false, error: `jq error: ${err.stderr || err.message}` };
      }
    }

    // Fallback: simple dot-path traversal (no jq)
    try {
      // Strip leading dot, split on dots and bracket notation
      const parts = args.query.replace(/^\./, '').split(/\.|\[(\d+)\]/).filter(Boolean);
      let cur = jsonData;
      for (const part of parts) {
        if (cur === undefined || cur === null) break;
        const idx = /^\d+$/.test(part) ? parseInt(part) : part;
        cur = cur[idx];
      }
      return { success: true, engine: 'dot-path', query: args.query, result: cur, note: 'Install jq for full query support.' };
    } catch (err) {
      return { success: false, error: err.message, note: 'Install jq for full jq query support.' };
    }
  },
};

// ── image_describe ────────────────────────────────────────────────────────────
export const imageDescribeTool = {
  name: 'image_describe',
  description: 'Read and describe an image file by sending it to the vision-capable AI model. Returns a text description. Supports PNG, JPG, WEBP, GIF.',
  category: 'data',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path:   { type: 'string', description: 'Path to image file (relative to working directory)' },
      prompt: { type: 'string', description: 'What to look for or ask about the image (default: "Describe this image in detail.")' },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const filePath = path.resolve(context.workingDir, args.path);
    if (!fs.existsSync(filePath)) return { success: false, error: `File not found: ${args.path}` };

    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
    const mime = mimeMap[ext];
    if (!mime) return { success: false, error: `Unsupported image type: ${ext}. Supported: png, jpg, gif, webp` };

    try {
      const imageData = fs.readFileSync(filePath);
      const b64 = imageData.toString('base64');
      const prompt = args.prompt || 'Describe this image in detail.';

      // Dynamically import the AI client — works with any OpenAI-compatible model
      const { getAiClientForUser } = await import('../../ai/controllers/ai/clientFactory.js');
      const providerInfo = await getAiClientForUser(context.userId);
      if (!providerInfo?.client) return { success: false, error: 'Could not get AI client for vision.' };

      const response = await providerInfo.client.client.chat.completions.create({
        model: providerInfo.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
            { type: 'text', text: prompt },
          ],
        }],
        max_tokens: 1024,
      });

      const description = response.choices[0]?.message?.content || 'No description returned.';
      return { success: true, path: args.path, description };
    } catch (err) {
      return { success: false, error: err.message, note: 'Vision requires a model that supports image inputs (e.g. GPT-4o, Claude 3+).' };
    }
  },
};

// ── inspect_attachment ───────────────────────────────────────────────────────
export const inspectAttachmentTool = {
  name: 'inspect_attachment',
  description: 'Inspect an attached file by routing to the right capability: images use vision, audio uses Whisper transcription, PDFs use text extraction, text files are read directly, and unknown binaries return metadata.',
  category: 'data',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Attachment/file path relative to working directory' },
      prompt: { type: 'string', description: 'Optional question or focus for image inspection' },
      language: { type: 'string', description: 'Optional audio language code for transcription' },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir, context.workspaceRoot);
    if (!fs.existsSync(filePath)) return { success: false, error: `File not found: ${args.path}` };
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) return { success: false, error: `"${args.path}" is a directory, not a file.` };

    const { kind, ext } = fileKind(filePath);
    const base = {
      path: args.path,
      kind,
      ext,
      size: stat.size,
      sizeLabel: stat.size < 1024 ? `${stat.size}B` : stat.size < 1048576 ? `${(stat.size / 1024).toFixed(1)}KB` : `${(stat.size / 1048576).toFixed(1)}MB`,
    };

    if (kind === 'image') {
      return imageDescribeTool.execute({ path: args.path, prompt: args.prompt || 'Describe this image and note any text, UI, objects, or important visual details.' }, context);
    }

    if (kind === 'audio') {
      const whisperStatus = getWhisperStatus();
      if (whisperStatus.status !== 'ready') {
        return { success: false, ...base, error: 'Whisper STT model is not loaded. Load a Whisper model before inspecting audio attachments.' };
      }
      try {
        const result = await transcribe(fs.readFileSync(filePath), { language: args.language || undefined });
        return { success: true, ...base, text: result.text, language: result.language, segments: result.segments?.length || 0, model: whisperStatus.model };
      } catch (err) {
        return { success: false, ...base, error: `Transcription failed: ${err.message}` };
      }
    }

    if (kind === 'pdf') {
      return readPdfTool.execute({ path: args.path }, context);
    }

    if (kind === 'text') {
      if (stat.size > 1024 * 1024) {
        return { success: false, ...base, error: 'Text file is too large to inspect fully. Ask to inspect a smaller portion or use search tools.' };
      }
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, ...base, content: content.length > 12000 ? `${content.slice(0, 12000)}\n... [truncated]` : content };
    }

    return {
      success: true,
      ...base,
      message: 'This attachment is a binary or unsupported type. I can report metadata, but need a specialized tool to inspect its contents.',
    };
  },
};

export const dataTools = [
  inspectAttachmentTool,
  readPdfTool,
  readCsvTool,
  writeCsvTool,
  zipFilesTool,
  unzipFilesTool,
  jsonQueryTool,
  imageDescribeTool,
];
export default dataTools;
