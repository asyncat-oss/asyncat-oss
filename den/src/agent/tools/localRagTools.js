// den/src/agent/tools/localRagTools.js
// Offline, file-backed retrieval over local folders. Each chunk stores a
// deterministic lexical vector (always) plus a provider embedding (when the
// active provider exposes /embeddings). Search uses the provider vectors when
// the query embeds into the same space, and transparently falls back to the
// lexical vectors otherwise — so an index built online still searches offline.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { PermissionLevel } from './toolRegistry.js';
import { safePath, isPathInside } from './shared.js';
import { embedBatch, embedText } from '../../ai/embeddings/embeddingService.js';
import { lexicalVector, cosineSim, tokenize, LEXICAL_MODEL, LEXICAL_DIMS } from '../../ai/embeddings/lexicalVector.js';

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.svelte-kit', '.turbo', '.cache', '.asyncat', '.agent_tmp', 'vendor',
  '__pycache__', '.venv', 'venv', 'target',
]);

const DEFAULT_EXTS = new Set([
  '.md', '.mdx', '.txt', '.rst',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.css', '.scss', '.html', '.json', '.yaml', '.yml',
  '.sql', '.sh',
]);

const EMBED_BATCH = 64;

function ragDir(workingDir) {
  const dir = path.join(workingDir, '.asyncat', 'rag');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(text, fallback = 'local-rag') {
  return String(text || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || fallback;
}

function shouldIndexFile(filePath, extensions) {
  const ext = path.extname(filePath).toLowerCase();
  return extensions.has(ext);
}

function collectFiles(root, extensions, maxFiles) {
  const files = [];
  const stack = [root];
  while (stack.length && files.length < maxFiles) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile() && shouldIndexFile(full, extensions)) {
        files.push(full);
        if (files.length >= maxFiles) break;
      }
    }
  }
  return files;
}

function chunkText(text, chunkSize, overlap) {
  const clean = String(text || '').replace(/\r\n/g, '\n');
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + chunkSize);
    if (end < clean.length) {
      const newline = clean.lastIndexOf('\n', end);
      if (newline > start + chunkSize * 0.55) end = newline;
    }
    const content = clean.slice(start, end).trim();
    if (content) chunks.push({ content, start, end });
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

function indexPathFor(workingDir, indexName) {
  const dir = ragDir(workingDir);
  const clean = `${slugify(indexName)}.json`;
  const filePath = path.join(dir, clean);
  if (!isPathInside(filePath, dir)) throw new Error('Invalid index name.');
  return filePath;
}

function newestIndexPath(workingDir) {
  const dir = ragDir(workingDir);
  const candidates = fs.readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const filePath = path.join(dir, name);
      return { filePath, mtime: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.filePath || null;
}

function loadIndex(workingDir, indexName) {
  const filePath = indexName ? indexPathFor(workingDir, indexName) : newestIndexPath(workingDir);
  if (!filePath || !fs.existsSync(filePath)) throw new Error('No local RAG index found. Run local_rag_index first.');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function excerptFor(content, queryTokens, maxChars = 900) {
  const lower = content.toLowerCase();
  let pos = -1;
  for (const token of queryTokens) {
    pos = lower.indexOf(token);
    if (pos >= 0) break;
  }
  const start = pos >= 0 ? Math.max(0, pos - Math.floor(maxChars / 3)) : 0;
  return content.slice(start, start + maxChars).trim();
}

function keywordBonus(content, queryTokens) {
  const lower = content.toLowerCase();
  let hits = 0;
  for (const token of new Set(queryTokens)) {
    if (lower.includes(token)) hits += 1;
  }
  return queryTokens.length ? hits / Math.min(queryTokens.length, 12) : 0;
}

export const localRagIndexTool = {
  name: 'local_rag_index',
  description: 'Build a local retrieval index for a codebase or docs folder. Stores a file-backed index under .asyncat/rag. Uses the active provider\'s embeddings when available (semantic) and always keeps an offline lexical vector as a fallback.',
  category: 'rag',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Folder to index, relative to the working directory. Default current folder.' },
      index_name: { type: 'string', description: 'Name for the index. Default derived from folder name.' },
      extensions: { type: 'array', items: { type: 'string' }, description: 'Optional file extensions to include, such as .md, .js, .ts.' },
      max_files: { type: 'number', description: 'Maximum files to index. Default 300, cap 2000.' },
      chunk_chars: { type: 'number', description: 'Approximate chunk size in characters. Default 1800.' },
    },
  },
  execute: async (args, context) => {
    try {
      const root = safePath(args.path || '.', context.workingDir);
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        return { success: false, error: `Folder not found: ${args.path || '.'}` };
      }
      const extensions = Array.isArray(args.extensions) && args.extensions.length
        ? new Set(args.extensions.map(ext => String(ext).startsWith('.') ? String(ext).toLowerCase() : `.${String(ext).toLowerCase()}`))
        : DEFAULT_EXTS;
      const maxFiles = Math.max(1, Math.min(2000, Number(args.max_files) || 300));
      const chunkSize = Math.max(600, Math.min(6000, Number(args.chunk_chars) || 1800));
      const overlap = Math.floor(chunkSize * 0.12);
      const files = collectFiles(root, extensions, maxFiles);
      const chunks = [];

      for (const filePath of files) {
        let stat;
        try { stat = fs.statSync(filePath); } catch { continue; }
        if (!stat.isFile() || stat.size > 1024 * 1024) continue;
        let text;
        try { text = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
        const relativePath = path.relative(context.workingDir, filePath);
        for (const chunk of chunkText(text, chunkSize, overlap)) {
          chunks.push({
            id: randomUUID().slice(0, 12),
            path: relativePath,
            start: chunk.start,
            end: chunk.end,
            content: chunk.content,
            lex: lexicalVector(chunk.content),
          });
        }
      }

      // Provider embeddings (semantic). Batched + cached; degrades to lexical-only
      // if the active provider has no embeddings endpoint.
      let embeddingModel = LEXICAL_MODEL;
      let embeddingDim = LEXICAL_DIMS;
      let semanticChunks = 0;
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH);
        const results = await embedBatch(batch.map(c => c.content), { userId: context.userId });
        results.forEach((res, k) => {
          if (res && res.model !== LEXICAL_MODEL && Array.isArray(res.vector)) {
            batch[k].vec = res.vector;
            embeddingModel = res.model;
            embeddingDim = res.dim;
            semanticChunks += 1;
          }
        });
      }

      const indexName = slugify(args.index_name || path.basename(root) || 'workspace');
      const index = {
        version: 2,
        indexName,
        root: path.relative(context.workingDir, root) || '.',
        createdAt: new Date().toISOString(),
        embedding: { model: embeddingModel, dimensions: embeddingDim, semantic: semanticChunks > 0 },
        files: files.map(filePath => path.relative(context.workingDir, filePath)),
        chunks,
      };
      const filePath = indexPathFor(context.workingDir, indexName);
      fs.writeFileSync(filePath, JSON.stringify(index), 'utf8');

      return {
        success: true,
        indexName,
        path: path.relative(context.workingDir, filePath),
        files: index.files.length,
        chunks: chunks.length,
        embeddingModel,
        semantic: semanticChunks > 0,
        message: `Indexed ${index.files.length} file(s) into ${chunks.length} chunk(s) as "${indexName}" (${semanticChunks > 0 ? `semantic via ${embeddingModel}` : 'offline lexical'}).`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const localRagSearchTool = {
  name: 'local_rag_search',
  description: 'Search a local RAG index and return relevant file chunks with excerpts. Uses semantic embeddings when the index has them and the query embeds into the same space, otherwise lexical matching. Run local_rag_index first.',
  category: 'rag',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Question or search query.' },
      index_name: { type: 'string', description: 'Optional index name. Defaults to newest index.' },
      limit: { type: 'number', description: 'Maximum chunks to return. Default 8.' },
      include_content: { type: 'boolean', description: 'Include full chunk content instead of short excerpts.' },
    },
    required: ['query'],
  },
  execute: async (args, context) => {
    try {
      const query = String(args.query || '').trim();
      if (!query) return { success: false, error: 'query is required.' };
      const index = loadIndex(context.workingDir, args.index_name);
      const queryTokens = tokenize(query);
      const limit = Math.max(1, Math.min(30, Number(args.limit) || 8));

      // Embed the query, then decide whether we can use the index's semantic
      // vectors (same model) or must fall back to the always-present lexical ones.
      const emb = await embedText(query, { userId: context.userId });
      const indexModel = index.embedding?.model || LEXICAL_MODEL;
      const useSemantic = Boolean(emb && emb.model !== LEXICAL_MODEL && emb.model === indexModel && index.embedding?.semantic);
      const queryVec = useSemantic ? emb.vector : lexicalVector(query);

      const results = (index.chunks || [])
        .map(chunk => {
          const chunkVec = useSemantic ? chunk.vec : (chunk.lex || chunk.vector);
          const semantic = chunkVec ? cosineSim(queryVec, chunkVec) : 0;
          const keyword = keywordBonus(chunk.content, queryTokens);
          return {
            id: chunk.id,
            path: chunk.path,
            start: chunk.start,
            end: chunk.end,
            score: Number((semantic + keyword * 0.25).toFixed(4)),
            excerpt: args.include_content ? chunk.content : excerptFor(chunk.content, queryTokens),
            content: args.include_content ? chunk.content : undefined,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return {
        success: true,
        indexName: index.indexName,
        query,
        method: useSemantic ? `semantic (${indexModel})` : 'lexical',
        count: results.length,
        results,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const localRagListTool = {
  name: 'local_rag_list',
  description: 'List local RAG indexes available in this workspace.',
  category: 'rag',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    try {
      const dir = ragDir(context.workingDir);
      const indexes = fs.readdirSync(dir)
        .filter(name => name.endsWith('.json'))
        .map(name => {
          const filePath = path.join(dir, name);
          const stat = fs.statSync(filePath);
          let parsed = {};
          try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { /* ignore */ }
          return {
            indexName: parsed.indexName || name.replace(/\.json$/, ''),
            path: path.relative(context.workingDir, filePath),
            root: parsed.root || '',
            files: parsed.files?.length || 0,
            chunks: parsed.chunks?.length || 0,
            embeddingModel: parsed.embedding?.model || LEXICAL_MODEL,
            semantic: Boolean(parsed.embedding?.semantic),
            modified: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.modified.localeCompare(a.modified));
      return { success: true, count: indexes.length, indexes };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const localRagTools = [localRagIndexTool, localRagSearchTool, localRagListTool];

export default localRagTools;
