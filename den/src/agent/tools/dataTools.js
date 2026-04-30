// den/src/agent/tools/dataTools.js
// ─── Data & File Format Tools ────────────────────────────────────────────────
// read_pdf, read_csv, write_csv, zip_files, unzip_files, json_query,
// diff_apply, ssh_exec

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PermissionLevel } from './toolRegistry.js';

const PLATFORM = os.platform();
const IS_WIN   = PLATFORM === 'win32';

function hasBin(bin) {
  try { execSync(IS_WIN ? `where ${bin} 2>nul` : `which ${bin} 2>/dev/null`); return true; } catch { return false; }
}

function runProc(cmd, opts = {}) {
  return new Promise((resolve) => {
    const [sh, flag] = IS_WIN ? ['cmd.exe', '/c'] : ['/bin/sh', '-c'];
    let stdout = '', stderr = '';
    const proc = spawn(sh, [flag, cmd], { cwd: opts.cwd || process.cwd(), shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const filePath = path.resolve(context.workingDir, args.path);
    if (!fs.existsSync(filePath)) return { success: false, error: `File not found: ${args.path}` };
    if (!filePath.endsWith('.pdf') && !filePath.toLowerCase().endsWith('.pdf')) {
      return { success: false, error: 'File does not appear to be a PDF.' };
    }

    if (!hasBin('pdftotext')) {
      return {
        success: false,
        error: 'pdftotext not found.',
        install: IS_WIN ? 'Download poppler for Windows: https://github.com/oschwartz10612/poppler-windows/releases'
          : PLATFORM === 'darwin' ? 'brew install poppler'
          : 'sudo apt install poppler-utils',
      };
    }

    try {
      const pageFlag = args.pages ? `-f ${args.pages.split('-')[0]} -l ${args.pages.split('-')[1] || args.pages.split('-')[0]}` : '';
      const layoutFlag = args.layout ? '-layout' : '';
      const tmpOut = path.join(os.tmpdir(), `asyncat_pdf_${Date.now()}.txt`);
      execSync(`pdftotext ${pageFlag} ${layoutFlag} "${filePath}" "${tmpOut}"`, { timeout: 30000 });
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
    const filePath = path.resolve(context.workingDir, args.path);
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
    const outPath = path.resolve(context.workingDir, args.output);
    const sources = args.sources.map(s => path.resolve(context.workingDir, s));

    for (const src of sources) {
      if (!fs.existsSync(src)) return { success: false, error: `Source not found: ${src}` };
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    try {
      let result;
      if (IS_WIN) {
        const srcList = sources.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
        const ps = `Compress-Archive -Path ${srcList} -DestinationPath '${outPath.replace(/'/g, "''")}' -Force`;
        result = await runProc(`powershell -NoProfile -Command "${ps}"`, { cwd: context.workingDir, timeout: 60000 });
      } else {
        const srcsStr = sources.map(s => `"${s}"`).join(' ');
        result = await runProc(`zip -r "${outPath}" ${srcsStr}`, { cwd: context.workingDir, timeout: 60000 });
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
    const srcPath = path.resolve(context.workingDir, args.source);
    if (!fs.existsSync(srcPath)) return { success: false, error: `File not found: ${args.source}` };

    const destPath = path.resolve(context.workingDir, args.destination || path.basename(args.source, '.zip'));
    fs.mkdirSync(destPath, { recursive: true });

    try {
      let result;
      if (IS_WIN) {
        const ps = `Expand-Archive -Path '${srcPath.replace(/'/g, "''")}' -DestinationPath '${destPath.replace(/'/g, "''")}' -Force`;
        result = await runProc(`powershell -NoProfile -Command "${ps}"`, { cwd: context.workingDir, timeout: 60000 });
      } else {
        result = await runProc(`unzip -o "${srcPath}" -d "${destPath}"`, { cwd: context.workingDir, timeout: 60000 });
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
        const out = execSync(`jq '${args.query.replace(/'/g, "'\\''")}' "${tmpIn}"`, { encoding: 'utf8', timeout: 10000 });
        try { fs.unlinkSync(tmpIn); } catch {}
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

// ── diff_apply ────────────────────────────────────────────────────────────────
export const diffApplyTool = {
  name: 'diff_apply',
  description: 'Apply a unified diff/patch to files. Requires the patch command (available on Linux/macOS by default; Windows: install GNU patch or use Git for Windows).',
  category: 'data',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      patch_file: { type: 'string', description: 'Path to .patch or .diff file (relative to working directory). Use instead of patch_content.' },
      patch_content: { type: 'string', description: 'Raw unified diff content to apply directly.' },
      strip:         { type: 'number', description: 'Strip N leading path components (-p flag, default: 0)' },
      dry_run:       { type: 'boolean', description: 'Check if patch applies without actually changing files (default: false)' },
    },
    required: [],
  },
  execute: async (args, context) => {
    if (!hasBin('patch')) {
      return {
        success: false,
        error: 'patch command not found.',
        install: IS_WIN ? 'Install Git for Windows (includes patch) or GNU patch for Windows.'
          : PLATFORM === 'darwin' ? 'patch is built-in on macOS. Try: xcode-select --install'
          : 'sudo apt install patch',
      };
    }

    let patchPath;
    const owned = !args.patch_file; // we created the tmp file

    try {
      if (args.patch_file) {
        patchPath = path.resolve(context.workingDir, args.patch_file);
        if (!fs.existsSync(patchPath)) return { success: false, error: `Patch file not found: ${args.patch_file}` };
      } else if (args.patch_content) {
        patchPath = path.join(os.tmpdir(), `asyncat_patch_${Date.now()}.diff`);
        fs.writeFileSync(patchPath, args.patch_content, 'utf8');
      } else {
        return { success: false, error: 'Provide either patch_file or patch_content.' };
      }

      const strip = args.strip ?? 0;
      const dryRun = args.dry_run ? '--dry-run' : '';
      const result = await runProc(`patch -p${strip} ${dryRun} -i "${patchPath}"`, { cwd: context.workingDir, timeout: 30000 });

      return {
        success: result.success,
        dry_run: !!args.dry_run,
        stdout: result.stdout?.slice(0, 4000),
        stderr: result.stderr?.slice(0, 2000),
        ...(result.error ? { error: result.error } : {}),
      };
    } finally {
      if (owned && patchPath) try { fs.unlinkSync(patchPath); } catch {}
    }
  },
};

// ── ssh_exec ─────────────────────────────────────────────────────────────────
export const sshExecTool = {
  name: 'ssh_exec',
  description: 'Execute a command on a remote host over SSH. Requires ssh to be installed and the host to be accessible. Use key_path for key-based auth or ensure the key is already loaded in ssh-agent.',
  category: 'shell',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      host:       { type: 'string', description: 'Remote host (hostname or IP)' },
      user:       { type: 'string', description: 'SSH username (default: current user)' },
      port:       { type: 'number', description: 'SSH port (default: 22)' },
      command:    { type: 'string', description: 'Command to run on the remote host' },
      key_path:   { type: 'string', description: 'Path to SSH private key file (optional)' },
      timeout:    { type: 'number', description: 'Timeout in seconds (default: 30)' },
    },
    required: ['host', 'command'],
  },
  execute: async (args, context) => {
    if (!hasBin('ssh')) {
      return { success: false, error: IS_WIN ? 'ssh not found. Enable OpenSSH Client in Windows Features or install Git for Windows.' : 'ssh not found. Install openssh-client.' };
    }

    const user    = args.user ? `${args.user}@` : '';
    const port    = args.port || 22;
    const timeout = args.timeout || 30;
    const keyFlag = args.key_path ? `-i "${path.resolve(context.workingDir, args.key_path)}"` : '';
    const cmd     = `ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=${timeout} -p ${port} ${keyFlag} ${user}${args.host} ${JSON.stringify(args.command)}`;

    try {
      const result = await runProc(cmd, { cwd: context.workingDir, timeout: (timeout + 5) * 1000 });
      return {
        success: result.success,
        host: args.host,
        command: args.command,
        stdout: result.stdout?.slice(0, 8000),
        stderr: result.stderr?.slice(0, 2000),
        exit_code: result.exit_code,
      };
    } catch (err) {
      return { success: false, error: err.message };
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

export const dataTools = [
  readPdfTool,
  readCsvTool,
  writeCsvTool,
  zipFilesTool,
  unzipFilesTool,
  jsonQueryTool,
  diffApplyTool,
  sshExecTool,
  imageDescribeTool,
];
export default dataTools;
