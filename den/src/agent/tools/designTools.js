// den/src/agent/tools/designTools.js
// Tools for conversational design work: inspect a product design system,
// create an interactive HTML canvas, and package a handoff bundle.

import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { randomUUID } from 'crypto';
import { PermissionLevel } from './toolRegistry.js';
import { formatSize, isPathInside } from './shared.js';
import { getArtifactsDir, getLegacyArtifactsDir } from '../workspacePaths.js';

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.svelte-kit', '.turbo', '.cache', 'data', 'logs', '.asyncat',
  '.asyncat-artifacts', '.asyncat-attachments', '.agent_tmp',
]);

const DESIGN_EXTS = new Set(['.css', '.scss', '.sass', '.less', '.html', '.jsx', '.tsx', '.js', '.ts']);
const DESIGN_FILENAMES = new Set([
  'package.json',
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
  'tailwind.config.ts',
  'postcss.config.js',
  'vite.config.js',
  'vite.config.ts',
  'next.config.js',
  'theme.js',
  'theme.ts',
  'tokens.json',
  'design-tokens.json',
]);

function ensureArtifactsDir(workingDir) {
  const dir = getArtifactsDir(workingDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(text, fallback = 'design') {
  return String(text || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56) || fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeFilename(filename, title, ext) {
  const desired = filename ? path.basename(filename) : `${slugify(title)}.${ext}`;
  const clean = desired.replace(/[^\w.\-]+/g, '-');
  return clean.toLowerCase().endsWith(`.${ext}`) ? clean : `${clean}.${ext}`;
}

function countItems(items) {
  const counts = new Map();
  for (const item of items || []) {
    const key = String(item || '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

function shouldInspectFile(relativePath) {
  const base = path.basename(relativePath);
  const ext = path.extname(base).toLowerCase();
  if (DESIGN_FILENAMES.has(base)) return true;
  if (!DESIGN_EXTS.has(ext)) return false;
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('/src/') ||
    normalized.includes('/app/') ||
    normalized.includes('/components/') ||
    normalized.includes('/styles/') ||
    normalized.includes('/pages/') ||
    normalized.includes('/public/') ||
    base === 'index.css' ||
    base === 'app.css' ||
    base === 'globals.css'
  );
}

function walkDesignFiles(root, maxFiles = 60) {
  const files = [];
  const stack = ['.'];

  while (stack.length && files.length < maxFiles) {
    const relDir = stack.pop();
    const absDir = path.join(root, relDir);
    let entries = [];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      const rel = path.join(relDir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(rel);
        continue;
      }
      if (shouldInspectFile(rel)) files.push(rel.replace(/\\/g, '/'));
      if (files.length >= maxFiles) break;
    }
  }

  return files;
}

function readSmallTextFile(root, relPath, maxBytes = 24_000) {
  const abs = path.resolve(root, relPath);
  if (!isPathInside(abs, root)) return null;
  const stat = fs.statSync(abs);
  if (!stat.isFile() || stat.size > 512 * 1024) return null;
  const content = fs.readFileSync(abs, 'utf8');
  return content.length > maxBytes ? `${content.slice(0, maxBytes)}\n/* ... truncated ... */` : content;
}

function extractPackages(packageJson) {
  try {
    const parsed = JSON.parse(packageJson);
    const deps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
    return Object.keys(deps).sort();
  } catch {
    return [];
  }
}

function inferFrameworks(packages) {
  const present = new Set(packages);
  return [
    present.has('react') ? 'React' : null,
    present.has('vite') ? 'Vite' : null,
    present.has('next') ? 'Next.js' : null,
    present.has('tailwindcss') ? 'Tailwind CSS' : null,
    present.has('lucide-react') ? 'Lucide icons' : null,
    present.has('framer-motion') ? 'Framer Motion' : null,
    present.has('@monaco-editor/react') ? 'Monaco editor' : null,
    present.has('recharts') ? 'Recharts' : null,
  ].filter(Boolean);
}

function extractDesignSignals(files) {
  const cssVariables = [];
  const colors = [];
  const classTokens = [];
  const componentNames = [];

  for (const file of files) {
    const content = file.content || '';
    cssVariables.push(...(content.match(/--[\w-]+\s*:\s*[^;}{]+/g) || []));
    colors.push(...(content.match(/#[0-9a-fA-F]{3,8}\b/g) || []));
    colors.push(...(content.match(/\b(?:rgb|rgba|hsl|hsla)\([^)]+\)/g) || []));
    classTokens.push(...(content.match(/\b(?:bg|text|border|ring|from|via|to|shadow|rounded|p[trblxy]?|m[trblxy]?|gap|grid|flex|items|justify|font|leading|tracking|w|h|min-w|min-h|max-w|max-h|dark|midnight):?[-\w/.[\]()%#]+/g) || []));

    const base = path.basename(file.path).replace(/\.[^.]+$/, '');
    if (/^[A-Z]/.test(base)) componentNames.push(base);
    const exportMatches = [...content.matchAll(/(?:export\s+default\s+function|export\s+function|function|const)\s+([A-Z][A-Za-z0-9_]*)/g)];
    componentNames.push(...exportMatches.map(match => match[1]));
  }

  return {
    cssVariables: countItems(cssVariables).slice(0, 40),
    colors: countItems(colors).slice(0, 32),
    classTokens: countItems(classTokens).slice(0, 60),
    componentNames: countItems(componentNames).slice(0, 40),
  };
}

function summarizeDesignSystem({ frameworks, signals, files }) {
  const lines = [];
  if (frameworks.length) lines.push(`Frameworks/libraries: ${frameworks.join(', ')}`);
  if (signals.colors.length) lines.push(`Common colors: ${signals.colors.slice(0, 12).map(i => i.value).join(', ')}`);
  if (signals.cssVariables.length) lines.push(`CSS variables: ${signals.cssVariables.slice(0, 12).map(i => i.value).join('; ')}`);
  if (signals.componentNames.length) lines.push(`Likely components: ${signals.componentNames.slice(0, 14).map(i => i.value).join(', ')}`);
  if (signals.classTokens.length) lines.push(`Common utility classes: ${signals.classTokens.slice(0, 18).map(i => i.value).join(', ')}`);
  lines.push(`Inspected files: ${files.map(f => f.path).slice(0, 20).join(', ')}${files.length > 20 ? '...' : ''}`);
  return lines.join('\n');
}

function normalizeSlider(slider) {
  const variable = String(slider?.variable || slider?.var || '').trim();
  if (!/^--[a-zA-Z0-9_-]+$/.test(variable)) return null;
  const min = Number.isFinite(Number(slider.min)) ? Number(slider.min) : 0;
  const max = Number.isFinite(Number(slider.max)) ? Number(slider.max) : 100;
  const value = Number.isFinite(Number(slider.value)) ? Number(slider.value) : min;
  return {
    label: String(slider.label || variable.replace(/^--/, '')).slice(0, 40),
    variable,
    min,
    max,
    step: Number.isFinite(Number(slider.step)) ? Number(slider.step) : 1,
    value,
    unit: String(slider.unit || '').slice(0, 8),
  };
}

function buildSliderControls(sliders = []) {
  const normalized = sliders.map(normalizeSlider).filter(Boolean).slice(0, 12);
  if (!normalized.length) return { styles: '', markup: '', script: '' };

  const rows = normalized.map(slider => `
      <label class="asyncat-design-control">
        <span>${escapeHtml(slider.label)}</span>
        <input
          type="range"
          min="${slider.min}"
          max="${slider.max}"
          step="${slider.step}"
          value="${slider.value}"
          data-var="${escapeHtml(slider.variable)}"
          data-unit="${escapeHtml(slider.unit)}"
        />
        <output>${slider.value}${escapeHtml(slider.unit)}</output>
      </label>`).join('');

  const styles = `
    .asyncat-design-controls {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 9999;
      width: min(260px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow: auto;
      border: 1px solid rgba(17, 24, 39, 0.14);
      border-radius: 14px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.9);
      color: #111827;
      box-shadow: 0 18px 50px rgba(17, 24, 39, 0.16);
      backdrop-filter: blur(18px);
      font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .asyncat-design-controls strong {
      display: block;
      margin-bottom: 8px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .asyncat-design-control {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 5px 8px;
      align-items: center;
      padding: 8px 0;
      border-top: 1px solid rgba(17, 24, 39, 0.08);
    }
    .asyncat-design-control:first-of-type { border-top: 0; }
    .asyncat-design-control span { font-weight: 650; }
    .asyncat-design-control output { color: #6b7280; font-variant-numeric: tabular-nums; }
    .asyncat-design-control input { grid-column: 1 / -1; width: 100%; accent-color: #4f46e5; }
    @media (max-width: 720px) {
      .asyncat-design-controls {
        left: 12px;
        right: 12px;
        top: auto;
        bottom: 12px;
        width: auto;
      }
    }`;

  const markup = `
  <aside class="asyncat-design-controls" aria-label="Design controls">
    <strong>Design controls</strong>
    ${rows}
  </aside>`;

  const script = `
  <script>
    (() => {
      const root = document.documentElement;
      document.querySelectorAll('.asyncat-design-control input').forEach((input) => {
        const apply = () => {
          const value = input.value + (input.dataset.unit || '');
          root.style.setProperty(input.dataset.var, value);
          const output = input.parentElement.querySelector('output');
          if (output) output.textContent = value;
        };
        input.addEventListener('input', apply);
        apply();
      });
    })();
  <\/script>`;

  return { styles, markup, script };
}

function defaultDesignBody(title, brief, format) {
  return `
    <main class="design-shell">
      <section class="design-hero">
        <p class="eyebrow">${escapeHtml(format || 'Design')}</p>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(brief || 'A polished visual direction generated from the conversation.')}</p>
      </section>
      <section class="design-grid">
        <article>
          <span>01</span>
          <h2>Primary Flow</h2>
          <p>Show the main user journey, key decisions, and the first screen stakeholders should react to.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Interaction Model</h2>
          <p>Expose states, transitions, and the controls that should become production behavior.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Handoff Notes</h2>
          <p>Capture implementation details, tokens, responsive behavior, and accessibility requirements.</p>
        </article>
      </section>
    </main>`;
}

function wrapDesignHtml({ title, brief, html, css, js, sliders, format, viewport }) {
  const controls = buildSliderControls(sliders);
  const baseCss = `
    :root {
      --design-radius: 12px;
      --design-gap: 18px;
      --design-scale: 1;
      --design-accent: #4f46e5;
      color-scheme: light;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #f7f8fb;
      color: #14161f;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .design-shell {
      width: min(1120px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 56px 0;
    }
    .design-hero {
      min-height: 42vh;
      display: grid;
      align-content: center;
      gap: 16px;
    }
    .design-hero .eyebrow {
      margin: 0;
      color: var(--design-accent);
      font-weight: 750;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .design-hero h1 {
      margin: 0;
      max-width: 820px;
      font-size: clamp(42px, 7vw, 86px);
      line-height: 0.98;
      letter-spacing: 0;
    }
    .design-hero p {
      margin: 0;
      max-width: 680px;
      font-size: 18px;
      line-height: 1.55;
      color: #5b6172;
    }
    .design-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--design-gap);
    }
    .design-grid article {
      min-height: 220px;
      padding: calc(22px * var(--design-scale));
      border: 1px solid rgba(20, 22, 31, 0.12);
      border-radius: var(--design-radius);
      background: white;
      box-shadow: 0 14px 38px rgba(20, 22, 31, 0.08);
    }
    .design-grid span {
      color: var(--design-accent);
      font-weight: 800;
      font-size: 12px;
    }
    .design-grid h2 { margin: 28px 0 10px; font-size: 19px; letter-spacing: 0; }
    .design-grid p { margin: 0; color: #646b7c; line-height: 1.55; }
    @media (max-width: 760px) {
      .design-shell { width: min(100% - 24px, 520px); padding: 32px 0 96px; }
      .design-grid { grid-template-columns: 1fr; }
      .design-hero { min-height: 34vh; }
    }`;

  const fullHtml = String(html || '').trim();
  const bodyMarkup = fullHtml || defaultDesignBody(title, brief, format);
  const metadata = `<!-- Asyncat design canvas: ${escapeHtml(title)} | ${escapeHtml(format || 'design')} | ${escapeHtml(viewport || 'responsive')} -->`;
  const styleTag = `<style>${baseCss}\n${controls.styles}\n${css || ''}</style>`;
  const scriptTag = `${js ? `<script>${js}<\/script>` : ''}${controls.script}`;

  if (/^\s*(?:<!doctype|<html[\s>])/i.test(bodyMarkup)) {
    let doc = bodyMarkup;
    doc = /<\/head>/i.test(doc)
      ? doc.replace(/<\/head>/i, `${styleTag}\n</head>`)
      : doc.replace(/<html[^>]*>/i, match => `${match}\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)}</title>${styleTag}</head>`);
    doc = /<\/body>/i.test(doc)
      ? doc.replace(/<\/body>/i, `${controls.markup}\n${scriptTag}\n</body>`)
      : `${doc}\n${controls.markup}\n${scriptTag}`;
    return `${metadata}\n${doc}`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${styleTag}
</head>
<body data-design-format="${escapeHtml(format || 'design')}" data-design-viewport="${escapeHtml(viewport || 'responsive')}">
${metadata}
${bodyMarkup}
${controls.markup}
${scriptTag}
</body>
</html>`;
}

function artifactRelativePath(workingDir, filePath) {
  return path.relative(workingDir, filePath);
}

function findArtifactFile(workingDir, filename) {
  const clean = path.basename(String(filename || ''));
  if (!clean) return null;
  const roots = [getArtifactsDir(workingDir), getLegacyArtifactsDir(workingDir)];
  for (const root of roots) {
    const filePath = path.resolve(root, clean);
    if (isPathInside(filePath, root) && fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

function newestHtmlArtifact(workingDir) {
  const roots = [getArtifactsDir(workingDir), getLegacyArtifactsDir(workingDir)];
  const candidates = roots
    .filter(root => fs.existsSync(root))
    .flatMap(root => fs.readdirSync(root)
      .filter(name => /\.(html|htm)$/i.test(name))
      .map(name => {
        const filePath = path.join(root, name);
        return { filePath, mtime: fs.statSync(filePath).mtimeMs };
      }));
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.filePath || null;
}

function buildHandoffMarkdown(args, sourceInfo) {
  const title = args.title || 'Design handoff';
  const sections = [
    `# ${title}`,
    args.summary ? `## Summary\n${args.summary}` : null,
    args.design_intent ? `## Design Intent\n${args.design_intent}` : null,
    args.audience ? `## Audience\n${args.audience}` : null,
    args.design_system ? `## Design System\n${typeof args.design_system === 'string' ? args.design_system : JSON.stringify(args.design_system, null, 2)}` : null,
    Array.isArray(args.screens) && args.screens.length
      ? `## Screens\n${args.screens.map((screen, i) => `${i + 1}. ${typeof screen === 'string' ? screen : `${screen.name || 'Screen'}: ${screen.notes || ''}`}`).join('\n')}`
      : null,
    args.interaction_notes ? `## Interaction Notes\n${args.interaction_notes}` : null,
    args.responsive_notes ? `## Responsive Behavior\n${args.responsive_notes}` : null,
    args.accessibility_notes ? `## Accessibility Notes\n${args.accessibility_notes}` : null,
    args.implementation_notes ? `## Implementation Notes\n${args.implementation_notes}` : null,
    Array.isArray(args.implementation_checklist) && args.implementation_checklist.length
      ? `## Implementation Checklist\n${args.implementation_checklist.map(item => `- [ ] ${item}`).join('\n')}`
      : null,
    sourceInfo?.filename ? `## Source Artifact\n- ${sourceInfo.filename}` : null,
    `## Generated\n${new Date().toISOString()}`,
  ].filter(Boolean);

  return `${sections.join('\n\n')}\n`;
}

export const inspectDesignSystemTool = {
  name: 'inspect_design_system',
  description:
    'Inspect the current workspace for design-system signals: frameworks, CSS variables, colors, utility classes, component names, and style files. Use before creating a design canvas when the output should match the product.',
  category: 'design',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional specific files or directories to inspect, relative to the working directory.',
      },
      max_files: { type: 'number', description: 'Maximum files to inspect. Default 60.' },
    },
    required: [],
  },
  execute: async (args, context) => {
    try {
      const root = path.resolve(context.workingDir);
      const requestedPaths = Array.isArray(args.paths) ? args.paths.filter(Boolean).slice(0, 20) : [];
      const maxFiles = Math.max(5, Math.min(120, Number(args.max_files) || 60));
      let candidateFiles = [];

      if (requestedPaths.length) {
        for (const requested of requestedPaths) {
          const abs = path.resolve(root, requested);
          if (!isPathInside(abs, root) || !fs.existsSync(abs)) continue;
          const stat = fs.statSync(abs);
          if (stat.isDirectory()) {
            candidateFiles.push(...walkDesignFiles(abs, maxFiles).map(file => path.join(requested, file).replace(/\\/g, '/')));
          } else if (stat.isFile()) {
            candidateFiles.push(String(requested).replace(/\\/g, '/'));
          }
        }
      } else {
        candidateFiles = walkDesignFiles(root, maxFiles);
      }

      candidateFiles = [...new Set(candidateFiles)].slice(0, maxFiles);
      const files = [];
      for (const rel of candidateFiles) {
        try {
          const content = readSmallTextFile(root, rel);
          if (content != null) files.push({ path: rel, content });
        } catch {
          // Skip unreadable files.
        }
      }

      const packageFile = files.find(file => path.basename(file.path) === 'package.json');
      const packages = packageFile ? extractPackages(packageFile.content) : [];
      const frameworks = inferFrameworks(packages);
      const signals = extractDesignSignals(files);
      const summary = summarizeDesignSystem({ frameworks, signals, files });

      return {
        success: true,
        summary,
        designSystem: {
          frameworks,
          packages: packages.slice(0, 60),
          colors: signals.colors,
          cssVariables: signals.cssVariables,
          utilityClasses: signals.classTokens,
          components: signals.componentNames,
          inspectedFiles: files.map(file => file.path),
        },
        message: `Inspected ${files.length} design-related file${files.length === 1 ? '' : 's'}.`,
      };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to inspect design system.' };
    }
  },
};

export const createDesignCanvasTool = {
  name: 'create_design_canvas',
  description:
    'Create a self-contained interactive design canvas as an HTML artifact. Use for prototypes, mockups, wireframes, landing pages, one-pagers, decks, and visual explorations. Supports optional CSS/JS and live CSS-variable sliders.',
  category: 'design',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Human-readable design title.' },
      brief: { type: 'string', description: 'Short design brief or intent.' },
      filename: { type: 'string', description: 'Optional output filename. Should end in .html.' },
      format: {
        type: 'string',
        enum: ['prototype', 'mockup', 'wireframe', 'deck', 'one-pager', 'landing-page', 'flow', 'design-system'],
        description: 'Design output type.',
      },
      viewport: {
        type: 'string',
        enum: ['responsive', 'desktop', 'tablet', 'mobile', 'deck', 'social'],
        description: 'Primary viewport target.',
      },
      html: { type: 'string', description: 'Body markup or a full HTML document.' },
      css: { type: 'string', description: 'Additional CSS for the design.' },
      js: { type: 'string', description: 'Optional JavaScript for prototype interactions.' },
      sliders: {
        type: 'array',
        items: { type: 'object' },
        description: 'Optional live controls: { label, variable, min, max, value, step, unit }. variable must be a CSS custom property like --radius.',
      },
      design_system: { type: ['string', 'object'], description: 'Optional design-system notes or tokens used.' },
      handoff_notes: { type: 'string', description: 'Optional notes for engineering handoff.' },
    },
    required: ['title'],
  },
  execute: async (args, context) => {
    try {
      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const id = randomUUID().slice(0, 10);
      const rawFilename = normalizeFilename(args.filename, args.title, 'html');
      const parsed = path.parse(rawFilename);
      const filename = `${parsed.name}_${id}.html`;
      const filePath = path.join(artifactsDir, filename);
      const content = wrapDesignHtml({
        title: args.title,
        brief: args.brief,
        html: args.html,
        css: args.css,
        js: args.js,
        sliders: args.sliders,
        format: args.format || 'prototype',
        viewport: args.viewport || 'responsive',
      });

      fs.writeFileSync(filePath, content, 'utf8');
      const stat = fs.statSync(filePath);
      const relativePath = artifactRelativePath(context.workingDir, filePath);

      return {
        success: true,
        artifact: {
          id,
          title: args.title,
          filename,
          path: relativePath,
          absolutePath: filePath,
          type: 'design',
          originalType: 'html',
          description: args.brief || args.handoff_notes || 'Interactive design canvas',
          size: stat.size,
          createdAt: new Date().toISOString(),
          format: args.format || 'prototype',
          viewport: args.viewport || 'responsive',
        },
        design: {
          title: args.title,
          format: args.format || 'prototype',
          viewport: args.viewport || 'responsive',
          sliders: (args.sliders || []).map(normalizeSlider).filter(Boolean),
          designSystem: args.design_system || null,
          handoffNotes: args.handoff_notes || '',
        },
        message: `Design canvas "${args.title}" created: ${relativePath} (${formatSize(stat.size)})`,
      };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to create design canvas.' };
    }
  },
};

export const createDesignHandoffTool = {
  name: 'create_design_handoff',
  description:
    'Package a design handoff bundle with design.md, manifest.json, optional source HTML, tokens, screens, accessibility notes, and implementation checklist. Use when a visual direction is ready to pass to engineering.',
  category: 'design',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Handoff title.' },
      design_filename: { type: 'string', description: 'Optional artifact filename for the source HTML design canvas. Defaults to the newest HTML artifact.' },
      summary: { type: 'string', description: 'Short summary of the design.' },
      design_intent: { type: 'string', description: 'What the design is trying to accomplish.' },
      audience: { type: 'string', description: 'Target audience or user group.' },
      design_system: { type: ['string', 'object'], description: 'Design-system tokens, components, or notes.' },
      screens: { type: 'array', items: { type: 'object' }, description: 'Screens or states included in the design.' },
      interaction_notes: { type: 'string', description: 'Prototype interactions, states, and transitions.' },
      responsive_notes: { type: 'string', description: 'Responsive behavior across breakpoints.' },
      accessibility_notes: { type: 'string', description: 'Accessibility and contrast requirements.' },
      implementation_notes: { type: 'string', description: 'Engineering implementation notes.' },
      implementation_checklist: { type: 'array', items: { type: 'string' }, description: 'Checklist for production implementation.' },
      filename: { type: 'string', description: 'Optional zip filename. Should end in .zip.' },
    },
    required: ['title'],
  },
  execute: async (args, context) => {
    try {
      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const id = randomUUID().slice(0, 10);
      const zipFilenameBase = normalizeFilename(args.filename, `${args.title}-handoff`, 'zip');
      const parsedZip = path.parse(zipFilenameBase);
      const zipFilename = `${parsedZip.name}_${id}.zip`;
      const zipPath = path.join(artifactsDir, zipFilename);

      const sourcePath = args.design_filename
        ? findArtifactFile(context.workingDir, args.design_filename)
        : newestHtmlArtifact(context.workingDir);
      const sourceInfo = sourcePath
        ? {
            filename: path.basename(sourcePath),
            relativePath: artifactRelativePath(context.workingDir, sourcePath),
            content: fs.readFileSync(sourcePath, 'utf8'),
          }
        : null;

      const handoffMarkdown = buildHandoffMarkdown(args, sourceInfo);
      const markdownFilename = `${slugify(args.title)}-handoff_${id}.md`;
      const markdownPath = path.join(artifactsDir, markdownFilename);
      fs.writeFileSync(markdownPath, handoffMarkdown, 'utf8');

      const manifest = {
        title: args.title,
        summary: args.summary || '',
        designIntent: args.design_intent || '',
        audience: args.audience || '',
        designSystem: args.design_system || null,
        screens: Array.isArray(args.screens) ? args.screens : [],
        interactions: args.interaction_notes || '',
        responsive: args.responsive_notes || '',
        accessibility: args.accessibility_notes || '',
        implementation: args.implementation_notes || '',
        checklist: Array.isArray(args.implementation_checklist) ? args.implementation_checklist : [],
        sourceArtifact: sourceInfo ? {
          filename: sourceInfo.filename,
          path: sourceInfo.relativePath,
        } : null,
        createdAt: new Date().toISOString(),
        generator: 'Asyncat Design',
      };

      const zip = new JSZip();
      zip.file('design.md', handoffMarkdown);
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      if (sourceInfo?.content) zip.file(`source/${sourceInfo.filename}`, sourceInfo.content);
      if (args.design_system) {
        zip.file('design-system.json', typeof args.design_system === 'string'
          ? JSON.stringify({ notes: args.design_system }, null, 2)
          : JSON.stringify(args.design_system, null, 2));
      }

      const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      fs.writeFileSync(zipPath, buffer);
      const zipStat = fs.statSync(zipPath);
      const mdStat = fs.statSync(markdownPath);

      return {
        success: true,
        artifact: {
          id,
          title: args.title,
          filename: zipFilename,
          path: artifactRelativePath(context.workingDir, zipPath),
          absolutePath: zipPath,
          type: 'zip',
          originalType: 'design_handoff',
          description: args.summary || 'Design handoff bundle',
          size: zipStat.size,
          createdAt: new Date().toISOString(),
        },
        relatedArtifacts: [
          {
            title: `${args.title} handoff notes`,
            filename: markdownFilename,
            path: artifactRelativePath(context.workingDir, markdownPath),
            absolutePath: markdownPath,
            type: 'markdown',
            size: mdStat.size,
            createdAt: new Date().toISOString(),
          },
        ],
        sourceArtifact: sourceInfo ? {
          filename: sourceInfo.filename,
          path: sourceInfo.relativePath,
        } : null,
        message: `Design handoff bundle created: ${artifactRelativePath(context.workingDir, zipPath)} (${formatSize(zipStat.size)}). Handoff notes: ${artifactRelativePath(context.workingDir, markdownPath)}`,
      };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to create design handoff.' };
    }
  },
};

export const designTools = [
  inspectDesignSystemTool,
  createDesignCanvasTool,
  createDesignHandoffTool,
];

export default designTools;
