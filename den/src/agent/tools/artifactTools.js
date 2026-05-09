// den/src/agent/tools/artifactTools.js
// ─── Artifact Generation Tools ──────────────────────────────────────────────
// Create rich documents, reports, diagrams, and data exports that users can
// preview and download from the agent UI.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { PermissionLevel } from './toolRegistry.js';

const ARTIFACTS_DIR_NAME = '.asyncat-artifacts';

/** Ensure artifacts directory exists and return its path. */
function ensureArtifactsDir(workingDir) {
  const dir = path.join(workingDir, ARTIFACTS_DIR_NAME);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Resolve safe path within working directory. */
function safePath(filePath, workingDir) {
  const resolved = path.resolve(workingDir, filePath);
  if (!resolved.startsWith(path.resolve(workingDir))) {
    throw new Error(`Path "${filePath}" is outside the working directory`);
  }
  return resolved;
}

// ── create_artifact ─────────────────────────────────────────────────────────

export const createArtifactTool = {
  name: 'create_artifact',
  description: 'Create a rich artifact (document, report, diagram, data export, styled page) that the user can preview and download. Supports markdown, HTML, SVG, mermaid diagrams, CSV, JSON, code files, and plain text. The artifact is saved to the workspace and a preview link is provided.',
  category: 'artifact',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Human-readable title for the artifact' },
      filename: { type: 'string', description: 'Output filename (e.g. "report.md", "diagram.svg", "data.csv", "page.html")' },
      content: { type: 'string', description: 'The full content of the artifact' },
      type: {
        type: 'string',
        enum: ['markdown', 'html', 'svg', 'mermaid', 'csv', 'json', 'code', 'text', 'pdf_source'],
        description: 'Content type. "mermaid" auto-wraps in an HTML viewer. "pdf_source" creates markdown that the user can export to PDF.',
      },
      description: { type: 'string', description: 'Brief description of what this artifact contains' },
    },
    required: ['title', 'filename', 'content', 'type'],
  },
  execute: async (args, context) => {
    try {
      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const id = randomUUID().slice(0, 12);
      const ext = path.extname(args.filename) || '.md';
      const baseName = path.basename(args.filename, ext);
      const safeFilename = `${baseName}_${id}${ext}`;
      const filePath = path.join(artifactsDir, safeFilename);

      let finalContent = args.content;
      let contentType = args.type;

      // For mermaid diagrams, wrap in an HTML viewer
      if (args.type === 'mermaid') {
        finalContent = wrapMermaidInHtml(args.title, args.content);
        contentType = 'html';
      }

      // For pdf_source, create a styled markdown document
      if (args.type === 'pdf_source') {
        finalContent = wrapPdfSourceMarkdown(args.title, args.content);
        contentType = 'markdown';
      }

      fs.writeFileSync(filePath, finalContent, 'utf8');

      const stat = fs.statSync(filePath);
      const relativePath = path.relative(context.workingDir, filePath);

      return {
        success: true,
        artifact: {
          id,
          title: args.title,
          filename: safeFilename,
          path: relativePath,
          absolutePath: filePath,
          type: contentType,
          originalType: args.type,
          description: args.description || '',
          size: stat.size,
          createdAt: new Date().toISOString(),
        },
        message: `Artifact "${args.title}" created: ${relativePath} (${formatSize(stat.size)})`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── create_markdown ─────────────────────────────────────────────────────────

export const createMarkdownTool = {
  name: 'create_markdown',
  description: 'Create a formatted markdown document (report, documentation, README, notes). Saved to the workspace for the user to view and download.',
  category: 'artifact',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Document title' },
      content: { type: 'string', description: 'Full markdown content' },
      filename: { type: 'string', description: 'Output filename (default: generated from title). Should end in .md' },
      path: { type: 'string', description: 'Optional: save to a specific path relative to working directory instead of artifacts folder' },
    },
    required: ['title', 'content'],
  },
  execute: async (args, context) => {
    try {
      const filename = args.filename || `${slugify(args.title)}.md`;
      let filePath;

      if (args.path) {
        filePath = safePath(args.path, context.workingDir);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
      } else {
        const artifactsDir = ensureArtifactsDir(context.workingDir);
        filePath = path.join(artifactsDir, filename);
      }

      // Add title as H1 if not already present
      let content = args.content;
      if (!content.trim().startsWith('# ')) {
        content = `# ${args.title}\n\n${content}`;
      }

      fs.writeFileSync(filePath, content, 'utf8');
      const stat = fs.statSync(filePath);
      const relativePath = path.relative(context.workingDir, filePath);

      return {
        success: true,
        artifact: {
          title: args.title,
          filename,
          path: relativePath,
          absolutePath: filePath,
          type: 'markdown',
          size: stat.size,
          createdAt: new Date().toISOString(),
        },
        message: `Markdown document "${args.title}" created: ${relativePath} (${formatSize(stat.size)})`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── create_diagram ──────────────────────────────────────────────────────────

export const createDiagramTool = {
  name: 'create_diagram',
  description: 'Create a diagram using Mermaid syntax. Generates an HTML file with the rendered diagram that can be viewed in a browser. Supports flowcharts, sequence diagrams, class diagrams, ER diagrams, Gantt charts, pie charts, and more.',
  category: 'artifact',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Diagram title' },
      diagram: { type: 'string', description: 'Mermaid diagram syntax (e.g. "graph TD\\n  A-->B\\n  B-->C")' },
      filename: { type: 'string', description: 'Output filename (default: generated from title). Will be saved as .html' },
    },
    required: ['title', 'diagram'],
  },
  execute: async (args, context) => {
    try {
      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const filename = args.filename?.replace(/\.[^.]+$/, '.html') || `${slugify(args.title)}.html`;
      const filePath = path.join(artifactsDir, filename);

      const htmlContent = wrapMermaidInHtml(args.title, args.diagram);
      fs.writeFileSync(filePath, htmlContent, 'utf8');

      const stat = fs.statSync(filePath);
      const relativePath = path.relative(context.workingDir, filePath);

      return {
        success: true,
        artifact: {
          title: args.title,
          filename,
          path: relativePath,
          absolutePath: filePath,
          type: 'mermaid',
          size: stat.size,
          diagramSource: args.diagram,
          createdAt: new Date().toISOString(),
        },
        message: `Diagram "${args.title}" created: ${relativePath}. Open in a browser to view.`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── create_csv ──────────────────────────────────────────────────────────────

export const createCsvTool = {
  name: 'create_csv',
  description: 'Create a CSV data file from structured data. The user can download and open it in a spreadsheet application.',
  category: 'artifact',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title/description of the data' },
      headers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Column headers',
      },
      rows: {
        type: 'array',
        items: { type: 'array' },
        description: 'Array of rows, each row is an array of values',
      },
      filename: { type: 'string', description: 'Output filename (default: generated from title). Should end in .csv' },
    },
    required: ['title', 'headers', 'rows'],
  },
  execute: async (args, context) => {
    try {
      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const filename = args.filename || `${slugify(args.title)}.csv`;
      const filePath = path.join(artifactsDir, filename);

      const csvLines = [
        args.headers.map(escapeCsvField).join(','),
        ...args.rows.map(row =>
          row.map(val => escapeCsvField(String(val ?? ''))).join(',')
        ),
      ];
      const csvContent = csvLines.join('\n') + '\n';

      fs.writeFileSync(filePath, csvContent, 'utf8');
      const stat = fs.statSync(filePath);
      const relativePath = path.relative(context.workingDir, filePath);

      return {
        success: true,
        artifact: {
          title: args.title,
          filename,
          path: relativePath,
          absolutePath: filePath,
          type: 'csv',
          size: stat.size,
          rowCount: args.rows.length,
          columnCount: args.headers.length,
          createdAt: new Date().toISOString(),
        },
        message: `CSV "${args.title}" created: ${relativePath} (${args.rows.length} rows, ${args.headers.length} columns)`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── create_html_page ────────────────────────────────────────────────────────

export const createHtmlPageTool = {
  name: 'create_html_page',
  description: 'Create a styled HTML page with embedded CSS. Useful for reports, dashboards, landing pages, and presentations. The page is self-contained and can be opened in any browser.',
  category: 'artifact',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Page title' },
      content: { type: 'string', description: 'Full HTML content (can include <style> and <script> tags)' },
      filename: { type: 'string', description: 'Output filename (default: generated from title). Should end in .html' },
    },
    required: ['title', 'content'],
  },
  execute: async (args, context) => {
    try {
      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const filename = args.filename || `${slugify(args.title)}.html`;
      const filePath = path.join(artifactsDir, filename);

      // Wrap in full HTML if not already a complete document
      let content = args.content;
      if (!content.trim().toLowerCase().startsWith('<!doctype') && !content.trim().toLowerCase().startsWith('<html')) {
        content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(args.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 2rem; background: #f8f9fa; color: #1a1a2e; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 12px; padding: 2.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
    h1 { font-size: 1.8rem; margin-top: 0; color: #1a1a2e; }
    h2 { color: #2d3748; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #e2e8f0; padding: 0.75rem 1rem; text-align: left; }
    th { background: #f7fafc; font-weight: 600; }
    code { background: #f1f5f9; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
    pre { background: #1e293b; color: #e2e8f0; padding: 1.25rem; border-radius: 8px; overflow-x: auto; }
    pre code { background: none; padding: 0; color: inherit; }
    a { color: #3b82f6; }
    @media (prefers-color-scheme: dark) {
      body { background: #0f172a; color: #e2e8f0; }
      .container { background: #1e293b; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
      h1, h2 { color: #f1f5f9; }
      h2 { border-bottom-color: #334155; }
      th { background: #334155; }
      th, td { border-color: #334155; }
      code { background: #334155; }
    }
  </style>
</head>
<body>
  <div class="container">
    ${content}
  </div>
</body>
</html>`;
      }

      fs.writeFileSync(filePath, content, 'utf8');
      const stat = fs.statSync(filePath);
      const relativePath = path.relative(context.workingDir, filePath);

      return {
        success: true,
        artifact: {
          title: args.title,
          filename,
          path: relativePath,
          absolutePath: filePath,
          type: 'html',
          size: stat.size,
          createdAt: new Date().toISOString(),
        },
        message: `HTML page "${args.title}" created: ${relativePath}. Open in a browser to view.`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── list_artifacts ──────────────────────────────────────────────────────────

export const listArtifactsTool = {
  name: 'list_artifacts',
  description: 'List all artifacts previously created in the current workspace.',
  category: 'artifact',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (_args, context) => {
    try {
      const artifactsDir = path.join(context.workingDir, ARTIFACTS_DIR_NAME);
      if (!fs.existsSync(artifactsDir)) {
        return { success: true, count: 0, artifacts: [], message: 'No artifacts found.' };
      }

      const files = fs.readdirSync(artifactsDir).filter(f => !f.startsWith('.'));
      const artifacts = files.map(f => {
        const filePath = path.join(artifactsDir, f);
        const stat = fs.statSync(filePath);
        const ext = path.extname(f).toLowerCase();
        return {
          filename: f,
          path: path.relative(context.workingDir, filePath),
          type: extToType(ext),
          size: formatSize(stat.size),
          sizeBytes: stat.size,
          modified: stat.mtime.toISOString(),
        };
      }).sort((a, b) => b.modified.localeCompare(a.modified));

      return {
        success: true,
        count: artifacts.length,
        artifacts,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text) {
  return String(text || 'artifact')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'artifact';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function escapeCsvField(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extToType(ext) {
  const map = {
    '.md': 'markdown', '.markdown': 'markdown',
    '.html': 'html', '.htm': 'html',
    '.svg': 'svg',
    '.csv': 'csv',
    '.json': 'json',
    '.txt': 'text',
    '.js': 'code', '.ts': 'code', '.py': 'code', '.sh': 'code',
    '.css': 'code', '.jsx': 'code', '.tsx': 'code',
  };
  return map[ext] || 'text';
}

function wrapMermaidInHtml(title, mermaidSrc) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; padding: 2rem;
      background: #f8f9fa; color: #1a1a2e;
      display: flex; flex-direction: column; align-items: center;
      min-height: 100vh;
    }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #2d3748; }
    .mermaid {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
      max-width: 100%;
      overflow-x: auto;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0f172a; color: #e2e8f0; }
      h1 { color: #f1f5f9; }
      .mermaid { background: #1e293b; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="mermaid">
${mermaidSrc}
  </div>
  <script>mermaid.initialize({ startOnLoad: true, theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' });<\/script>
</body>
</html>`;
}

function wrapPdfSourceMarkdown(title, content) {
  return `---
title: "${title}"
date: "${new Date().toISOString().split('T')[0]}"
---

# ${title}

${content}

---
*Generated by Asyncat Agent on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*
`;
}

// ── Export all tools ────────────────────────────────────────────────────────

export const artifactTools = [
  createArtifactTool,
  createMarkdownTool,
  createDiagramTool,
  createCsvTool,
  createHtmlPageTool,
  listArtifactsTool,
];
export default artifactTools;
