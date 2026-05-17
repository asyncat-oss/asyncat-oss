// den/src/agent/tools/codeSearchTools.js
// ─── Code Search Tools ──────────────────────────────────────────────────────
// Structured code search: find definitions, references, imports, exports.
// Regex-based V1 — no external dependencies.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PermissionLevel } from './toolRegistry.js';
import { safePath, truncate, hasBin, IS_WIN } from './shared.js';

// ── Language-aware patterns ────────────────────────────────────────────────

const LANG_PATTERNS = {
  javascript: {
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    functionDef: /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>|(\w+)\s*:\s*(?:async\s+)?(?:\([^)]*\)|function)/g,
    classDef: /(?:export\s+)?(?:default\s+)?class\s+(\w+)/g,
    exportDef: /export\s+(?:default\s+)?(?:(?:const|let|var|function|class|async)\s+)?(\w+)/g,
    importDef: /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g,
  },
  typescript: {
    extensions: ['.ts', '.tsx'],
    functionDef: /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/g,
    classDef: /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/g,
    interfaceDef: /(?:export\s+)?interface\s+(\w+)/g,
    typeDef: /(?:export\s+)?type\s+(\w+)\s*=/g,
    exportDef: /export\s+(?:default\s+)?(?:(?:const|let|var|function|class|async|interface|type|enum)\s+)?(\w+)/g,
    importDef: /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g,
  },
  python: {
    extensions: ['.py', '.pyi'],
    functionDef: /(?:async\s+)?def\s+(\w+)\s*\(/g,
    classDef: /class\s+(\w+)/g,
    importDef: /(?:from\s+([\w.]+)\s+)?import\s+(.+)/g,
    decoratorDef: /@(\w+)/g,
  },
  rust: {
    extensions: ['.rs'],
    functionDef: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g,
    structDef: /(?:pub\s+)?struct\s+(\w+)/g,
    implDef: /impl(?:\s+<[^>]+>)?\s+(\w+)/g,
    traitDef: /(?:pub\s+)?trait\s+(\w+)/g,
    enumDef: /(?:pub\s+)?enum\s+(\w+)/g,
  },
  go: {
    extensions: ['.go'],
    functionDef: /func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/g,
    structDef: /type\s+(\w+)\s+struct/g,
    interfaceDef: /type\s+(\w+)\s+interface/g,
  },
  java: {
    extensions: ['.java'],
    classDef: /(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?(?:class|interface|enum)\s+(\w+)/g,
    methodDef: /(?:public|private|protected)\s+(?:static\s+)?(?:[\w<>\[\]]+\s+)(\w+)\s*\(/g,
  },
  css: {
    extensions: ['.css', '.scss', '.less'],
    selectorDef: /([.#][\w-]+)\s*\{/g,
    mediaDef: /@media\s+([^{]+)/g,
    keyframesDef: /@keyframes\s+(\w+)/g,
    variableDef: /--([\w-]+)\s*:/g,
  },
  sql: {
    extensions: ['.sql'],
    tableDef: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi,
    indexDef: /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi,
    viewDef: /CREATE\s+(?:TEMP\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi,
  },
};

const EXT_TO_LANG = {};
for (const [lang, config] of Object.entries(LANG_PATTERNS)) {
  for (const ext of config.extensions) {
    EXT_TO_LANG[ext] = lang;
  }
}

function detectLang(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext] || null;
}

function findCodeRoot(workingDir) {
  const indicators = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'setup.py', 'pom.xml', 'Makefile', 'CMakeLists.txt'];
  let dir = workingDir;
  for (let i = 0; i < 5; i++) {
    for (const ind of indicators) {
      if (fs.existsSync(path.join(dir, ind))) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return workingDir;
}

function collectFiles(root, extensions, maxFiles = 500) {
  const files = [];
  const skipDirs = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.next', 'target', 'vendor', '.venv', 'venv', 'env']);

  function walk(dir) {
    if (files.length >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name) && !entry.name.startsWith('.')) {
          walk(path.join(dir, entry.name));
        }
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.has(ext)) {
          files.push(path.join(dir, entry.name));
        }
      }
    }
  }

  walk(root);
  return files;
}

function searchInFile(filePath, patterns, maxMatches = 50) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
  const lines = content.split('\n');
  const results = [];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    let count = 0;
    while ((match = pattern.exec(content)) !== null && count < maxMatches) {
      const pos = match.index;
      let lineNum = content.substring(0, pos).split('\n').length;
      const lineText = lines[lineNum - 1] || '';
      const name = match[1] || match[0];
      results.push({
        name,
        line: lineNum,
        text: lineText.trim().slice(0, 200),
        file: filePath,
      });
      count++;
    }
  }

  return results;
}

function findReferences(rootDir, symbol, extensions, maxResults = 30) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`(?:^|[^\\w])${escaped}(?:$|[^\\w])`, 'gm'),
  ];
  const files = collectFiles(rootDir, extensions, 300);
  const results = [];

  for (const file of files) {
    if (results.length >= maxResults) break;
    const refs = searchInFile(file, patterns, maxResults);
    results.push(...refs.slice(0, maxResults - results.length));
  }

  return results;
}

// ── Tool definitions ────────────────────────────────────────────────────────

export const codeSearchTool = {
  name: 'code_search',
  description:
    'Search for code structures: function/class/method definitions, import/export statements, ' +
    'interface/type definitions, and symbol references. More structured than grep — ' +
    'understands programming language patterns.',
  category: 'file',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Symbol name to search for (function, class, variable, etc.)' },
      kind: {
        type: 'string',
        enum: ['definition', 'reference', 'interface', 'import', 'export', 'any'],
        description: 'What to search for: definition, reference, interface, import, export, or any (default: any)',
      },
      path: { type: 'string', description: 'Directory to search in (default: working directory)' },
      language: { type: 'string', description: 'Language filter: javascript, typescript, python, rust, go, java, css, sql (default: auto-detect)' },
      max_results: { type: 'number', description: 'Maximum results (default: 50)' },
    },
    required: ['symbol'],
  },
  execute: async (args, context) => {
    const symbol = String(args.symbol || '').trim();
    if (!symbol) return { success: false, error: 'symbol is required' };

    const rootDir = safePath(args.path || '.', context.workingDir);
    if (!fs.existsSync(rootDir)) return { success: false, error: `Path not found: ${args.path || '.'}` };

    const kind = args.kind || 'any';
    const maxResults = Math.min(100, args.max_results || 50);
    const langFilter = args.language || null;

    let targetLangs = langFilter ? [langFilter.toLowerCase()] : Object.keys(LANG_PATTERNS);
    let allExtensions = new Set();
    for (const lang of targetLangs) {
      const config = LANG_PATTERNS[lang];
      if (!config) return { success: false, error: `Unknown language: ${lang}. Supported: ${Object.keys(LANG_PATTERNS).join(', ')}` };
      for (const ext of config.extensions) allExtensions.add(ext);
    }

    const files = collectFiles(rootDir, allExtensions, 500);
    const definitions = [];
    const references = [];

    for (const file of files) {
      const lang = detectLang(file);
      if (!lang || !LANG_PATTERNS[lang]) continue;
      if (langFilter && lang !== langFilter.toLowerCase()) continue;

      const config = LANG_PATTERNS[lang];
      const searchPatterns = [];

      if (kind === 'any' || kind === 'definition') {
        if (config.functionDef) searchPatterns.push(config.functionDef);
        if (config.classDef) searchPatterns.push(config.classDef);
        if (config.interfaceDef) searchPatterns.push(config.interfaceDef);
        if (config.typeDef) searchPatterns.push(config.typeDef);
        if (config.structDef) searchPatterns.push(config.structDef);
        if (config.implDef) searchPatterns.push(config.implDef);
        if (config.traitDef) searchPatterns.push(config.traitDef);
        if (config.enumDef) searchPatterns.push(config.enumDef);
        if (config.methodDef) searchPatterns.push(config.methodDef);
        if (config.decoratorDef) searchPatterns.push(config.decoratorDef);
        if (config.tableDef) searchPatterns.push(config.tableDef);
        if (config.selectorDef) searchPatterns.push(config.selectorDef);
        if (config.variableDef) searchPatterns.push(config.variableDef);
      }

      if (kind === 'any' || kind === 'import') {
        if (config.importDef) searchPatterns.push(config.importDef);
      }

      if (kind === 'any' || kind === 'export') {
        if (config.exportDef) searchPatterns.push(config.exportDef);
      }

      const matches = searchInFile(file, searchPatterns, maxResults);
      for (const m of matches) {
        if (m.name === symbol || m.text.includes(symbol)) {
          definitions.push(m);
        }
      }
    }

    if (kind === 'any' || kind === 'reference') {
      const refResults = findReferences(rootDir, symbol, allExtensions, maxResults);
      for (const ref of refResults) {
        const isDef = definitions.some(d => d.file === ref.file && d.line === ref.line);
        if (!isDef) {
          references.push(ref);
        }
      }
    }

    const allResults = [...definitions, ...references].slice(0, maxResults);
    const relativeResults = allResults.map(r => ({
      ...r,
      file: path.relative(rootDir, r.file) || r.file,
    }));

    return {
      success: true,
      symbol,
      kind,
      language: langFilter || 'auto',
      definitions: definitions.length,
      references: references.length,
      total: relativeResults.length,
      results: relativeResults,
    };
  },
};

export const listDefinitionsTool = {
  name: 'list_definitions',
  description:
    'List all definitions (functions, classes, interfaces, types) in a specific file. ' +
    'Useful for understanding a file before editing it.',
  category: 'file',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to working directory' },
      kind: {
        type: 'string',
        enum: ['function', 'class', 'interface', 'type', 'import', 'export', 'any'],
        description: 'What kind of definitions to list (default: any)',
      },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) return { success: false, error: `File not found: ${args.path}` };

    const lang = detectLang(filePath);
    if (!lang || !LANG_PATTERNS[lang]) {
      const ext = path.extname(filePath);
      return { success: false, error: `Unsupported language for extension: ${ext}. Supported: ${Object.keys(LANG_PATTERNS).join(', ')}` };
    }

    const config = LANG_PATTERNS[lang];
    const kind = args.kind || 'any';
    const searchPatterns = [];

    if (kind === 'any' || kind === 'function') searchPatterns.push(config.functionDef);
    if (kind === 'any' || kind === 'class') searchPatterns.push(config.classDef);
    if ((kind === 'any' || kind === 'interface') && config.interfaceDef) searchPatterns.push(config.interfaceDef);
    if ((kind === 'any' || kind === 'type') && config.typeDef) searchPatterns.push(config.typeDef);
    if ((kind === 'any' || kind === 'import') && config.importDef) searchPatterns.push(config.importDef);
    if ((kind === 'any' || kind === 'export') && config.exportDef) searchPatterns.push(config.exportDef);
    if (config.structDef) searchPatterns.push(config.structDef);
    if (config.methodDef) searchPatterns.push(config.methodDef);

    const results = searchInFile(filePath, searchPatterns, 200);
    const grouped = { functions: [], classes: [], interfaces: [], types: [], imports: [], exports: [], other: [] };

    for (const r of results) {
      const text = r.text;
      const entry = { name: r.name, line: r.line, preview: text.slice(0, 120) };
      if (/function|def|fn|func/.test(text) && !/class|struct|interface|type/.test(text)) grouped.functions.push(entry);
      else if (/class|struct|impl/.test(text)) grouped.classes.push(entry);
      else if (/interface|trait/.test(text)) grouped.interfaces.push(entry);
      else if (/type/.test(text) && !/import|export/.test(text)) grouped.types.push(entry);
      else if (/import/.test(text)) grouped.imports.push(entry);
      else if (/export/.test(text)) grouped.exports.push(entry);
      else grouped.other.push(entry);
    }

    return {
      success: true,
      file: args.path,
      language: lang,
      total: results.length,
      definitions: grouped,
    };
  },
};

export const codeSearchTools = [codeSearchTool, listDefinitionsTool];
export default codeSearchTools;
