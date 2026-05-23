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

function defaultAnimationBody(title, brief, animationType) {
  const label = animationType || 'interactive';
  return `
    <main class="animation-shell">
      <section class="animation-stage" aria-label="${escapeHtml(title)}">
        <canvas id="asyncat-animation-canvas"></canvas>
        <div class="animation-caption">
          <p>${escapeHtml(label)}</p>
          <h1>${escapeHtml(title)}</h1>
          <span>${escapeHtml(brief || 'Move the pointer across the stage to explore the motion system.')}</span>
        </div>
      </section>
    </main>`;
}

function defaultAnimationCss() {
  return `
    :root {
      --motion-speed: 1;
      --motion-density: 52;
      --motion-glow: 0.75;
      --motion-scale: 1;
    }
    body {
      overflow: hidden;
      background: #f6f4ef;
    }
    .animation-shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .animation-stage {
      position: relative;
      width: min(900px, calc(100vw - 32px));
      height: min(640px, calc(100vh - 32px));
      min-height: 360px;
      overflow: hidden;
      border: 1px solid rgba(17, 17, 17, 0.12);
      border-radius: 18px;
      background:
        radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(255, 255, 255, 0.92), transparent 32%),
        linear-gradient(135deg, #111, #3a3a3a 42%, #f7f4ec 43%, #ffffff);
      box-shadow: 0 32px 90px rgba(17, 17, 17, 0.22);
    }
    #asyncat-animation-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      filter: contrast(1.08) saturate(1.12);
    }
    .animation-caption {
      position: absolute;
      left: 24px;
      bottom: 22px;
      max-width: 420px;
      color: white;
      mix-blend-mode: difference;
      pointer-events: none;
    }
    .animation-caption p {
      margin: 0 0 8px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .animation-caption h1 {
      margin: 0;
      font-size: clamp(32px, 7vw, 82px);
      line-height: 0.94;
      letter-spacing: 0;
    }
    .animation-caption span {
      display: block;
      margin-top: 14px;
      font-size: 14px;
      line-height: 1.5;
      opacity: 0.78;
    }
    @media (max-width: 720px) {
      .animation-shell { padding: 12px; }
      .animation-stage { width: 100%; height: min(620px, calc(100vh - 24px)); border-radius: 14px; }
      .animation-caption { left: 18px; right: 18px; bottom: 92px; }
    }`;
}

function defaultAnimationJs() {
  return `
    (() => {
      const canvas = document.getElementById('asyncat-animation-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const stage = canvas.parentElement;
      const pointer = { x: 0.5, y: 0.5, down: false };
      const particles = [];
      const DPR = Math.min(2, window.devicePixelRatio || 1);

      const readNumber = (name, fallback) => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
        const parsed = parseFloat(raw);
        return Number.isFinite(parsed) ? parsed : fallback;
      };

      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(rect.width * DPR));
        canvas.height = Math.max(1, Math.floor(rect.height * DPR));
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      };

      const syncPointer = (event) => {
        const rect = stage.getBoundingClientRect();
        pointer.x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        pointer.y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        stage.style.setProperty('--mx', String(pointer.x * 100) + '%');
        stage.style.setProperty('--my', String(pointer.y * 100) + '%');
      };

      const seed = () => {
        particles.length = 0;
        const density = Math.round(readNumber('--motion-density', 52));
        for (let i = 0; i < density; i += 1) {
          particles.push({
            x: Math.random(),
            y: Math.random(),
            r: 4 + Math.random() * 26,
            v: 0.18 + Math.random() * 0.9,
            a: Math.random() * Math.PI * 2,
          });
        }
      };

      let lastDensity = 0;
      const draw = (time) => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const speed = readNumber('--motion-speed', 1);
        const density = Math.round(readNumber('--motion-density', 52));
        const glow = readNumber('--motion-glow', 0.75);
        const scale = readNumber('--motion-scale', 1);
        if (density !== lastDensity) {
          lastDensity = density;
          seed();
        }

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(246, 244, 239, 0.22)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'multiply';

        particles.forEach((p, index) => {
          const drift = time * 0.00008 * speed * p.v;
          const pullX = (pointer.x - 0.5) * 0.18;
          const pullY = (pointer.y - 0.5) * 0.18;
          const x = ((p.x + Math.cos(p.a + drift) * 0.08 + pullX + 1) % 1) * w;
          const y = ((p.y + Math.sin(p.a * 1.7 + drift) * 0.08 + pullY + 1) % 1) * h;
          const radius = p.r * scale * (pointer.down ? 1.45 : 1);
          const hue = (index * 29 + time * 0.018 + pointer.x * 160) % 360;
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * (3 + glow));
          gradient.addColorStop(0, 'hsla(' + hue + ', 88%, 72%, ' + (0.34 + glow * 0.22) + ')');
          gradient.addColorStop(0.42, 'hsla(' + ((hue + 74) % 360) + ', 82%, 58%, ' + (0.14 + glow * 0.1) + ')');
          gradient.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, radius * (3 + glow), 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i += 1) {
          const t = time * 0.00018 * speed + i;
          ctx.beginPath();
          ctx.ellipse(
            w * (0.5 + Math.cos(t) * 0.12 * pointer.x),
            h * (0.5 + Math.sin(t * 0.9) * 0.1 * pointer.y),
            w * (0.18 + i * 0.035),
            h * (0.08 + i * 0.018),
            t,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }

        requestAnimationFrame(draw);
      };

      window.addEventListener('resize', resize);
      stage.addEventListener('pointermove', syncPointer);
      stage.addEventListener('pointerdown', (event) => { pointer.down = true; syncPointer(event); });
      stage.addEventListener('pointerup', () => { pointer.down = false; });
      resize();
      seed();
      requestAnimationFrame(draw);
    })();`;
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
        enum: ['prototype', 'mockup', 'wireframe', 'deck', 'one-pager', 'landing-page', 'flow', 'design-system', 'animation', 'shader', 'particle-effect', 'loader'],
        description: 'Design output type.',
      },
      viewport: {
        type: 'string',
        enum: ['responsive', 'desktop', 'tablet', 'mobile', 'deck', 'social', 'square'],
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

export const createCodeAnimationTool = {
  name: 'create_code_animation',
  description:
    'Create a self-contained HTML/CSS/JavaScript animation artifact. Use for shader wallpapers, particle effects, rich hover cards, animated loaders, streaming text demos, sprite-style explainers, and other interactive code prototypes.',
  category: 'design',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Human-readable animation title.' },
      brief: { type: 'string', description: 'Short intent or behavior summary.' },
      filename: { type: 'string', description: 'Optional output filename. Should end in .html.' },
      animation_type: {
        type: 'string',
        enum: ['hover-effect', 'shader', 'particles', 'loader', 'text-stream', 'sprite', 'canvas', 'svg', 'css', 'interactive', 'presentation', 'slideshow', 'narrated'],
        description: 'The animation/prototype family. Use "presentation" for slide decks, "slideshow" for timed image shows, "narrated" for voiceover-driven content.',
      },
      html: { type: 'string', description: 'Body markup or a full HTML document.' },
      css: { type: 'string', description: 'CSS animation, layout, and visual styling.' },
      js: { type: 'string', description: 'JavaScript for canvas, shader-like effects, particles, pointer interactions, clicks, or streaming states.' },
      sliders: {
        type: 'array',
        items: { type: 'object' },
        description: 'Optional live CSS-variable controls: { label, variable, min, max, value, step, unit }. Good defaults include --motion-speed, --motion-density, --motion-glow, --motion-scale.',
      },
      tweak_notes: { type: 'string', description: 'Notes about onscreen tweaks or controls embedded directly in the animation.' },
      viewport: {
        type: 'string',
        enum: ['responsive', 'desktop', 'tablet', 'mobile', 'square'],
        description: 'Primary viewport target.',
      },
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
      const defaultSliders = [
        { label: 'Speed', variable: '--motion-speed', min: 0.1, max: 3, step: 0.1, value: 1 },
        { label: 'Density', variable: '--motion-density', min: 12, max: 120, step: 1, value: 52 },
        { label: 'Glow', variable: '--motion-glow', min: 0, max: 1.5, step: 0.05, value: 0.75 },
        { label: 'Scale', variable: '--motion-scale', min: 0.5, max: 2, step: 0.05, value: 1 },
      ];
      const content = wrapDesignHtml({
        title: args.title,
        brief: args.brief,
        html: args.html || defaultAnimationBody(args.title, args.brief, args.animation_type),
        css: `${defaultAnimationCss()}\n${args.css || ''}`,
        js: `${args.js || defaultAnimationJs()}`,
        sliders: args.sliders !== undefined ? args.sliders : defaultSliders,
        format: args.animation_type || 'animation',
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
          type: 'animation',
          originalType: 'html',
          description: args.brief || args.tweak_notes || 'Interactive code animation',
          size: stat.size,
          createdAt: new Date().toISOString(),
          animationType: args.animation_type || 'interactive',
          viewport: args.viewport || 'responsive',
        },
        animation: {
          title: args.title,
          animationType: args.animation_type || 'interactive',
          viewport: args.viewport || 'responsive',
          sliders: (Array.isArray(args.sliders) && args.sliders.length ? args.sliders : defaultSliders).map(normalizeSlider).filter(Boolean),
          tweakNotes: args.tweak_notes || '',
        },
        message: `Code animation "${args.title}" created: ${relativePath} (${formatSize(stat.size)})`,
      };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to create code animation.' };
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

// ── Narrated Slideshow HTML builder ──────────────────────────────────────────

function buildNarratedSlideshowHtml({ title, slides, theme, autoplay, loop, transition }) {
  const themes = {
    dark:  { bg: '#0a0a0a', text: '#f5f5f5', accent: '#4f46e5', cap: 'rgba(0,0,0,0.72)', ctrl: 'rgba(255,255,255,0.08)', ctrlH: 'rgba(255,255,255,0.18)' },
    light: { bg: '#ffffff', text: '#111111', accent: '#4f46e5', cap: 'rgba(255,255,255,0.84)', ctrl: 'rgba(0,0,0,0.06)', ctrlH: 'rgba(0,0,0,0.12)' },
    brand: { bg: '#0f172a', text: '#f1f5f9', accent: '#6366f1', cap: 'rgba(15,23,42,0.84)', ctrl: 'rgba(99,102,241,0.15)', ctrlH: 'rgba(99,102,241,0.3)' },
  };
  const c = themes[theme] || themes.dark;

  const slidesMarkup = slides.map((slide, i) => {
    const bg = slide.bg_color || (i % 2 === 0 ? c.bg : 'inherit');
    const fg = slide.text_color || c.text;
    return `    <div class="slide${i === 0 ? ' active' : ''}" data-index="${i}" data-duration="${slide.duration_ms || 5000}" data-caption="${escapeHtml(slide.caption || '')}" style="background:${escapeHtml(bg)};color:${escapeHtml(fg)}">
      <div class="slide-inner">
        ${slide.title ? `<h2 class="slide-title">${escapeHtml(slide.title)}</h2>` : ''}
        ${slide.subtitle ? `<p class="slide-sub">${escapeHtml(slide.subtitle)}</p>` : ''}
        ${slide.body ? `<div class="slide-body">${slide.body}</div>` : ''}
      </div>
    </div>`;
  }).join('\n');

  const audioDataJson = JSON.stringify(slides.map(s => s._audioBase64 || null));

  const transitionCss = transition === 'none'
    ? '.slide { display: none; } .slide.active { display: flex; }'
    : '.slide { opacity: 0; transition: opacity 0.45s ease; pointer-events: none; } .slide.active { opacity: 1; pointer-events: auto; }';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${c.bg}; color: ${c.text}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; width: 100vw; height: 100vh; }
    #slideshow { position: relative; width: 100%; height: 100%; overflow: hidden; }
    .slide { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 48px 56px 112px; }
    ${transitionCss}
    .slide-inner { max-width: 820px; width: 100%; text-align: center; }
    .slide-title { font-size: clamp(26px, 5vw, 62px); font-weight: 700; line-height: 1.08; margin-bottom: 18px; letter-spacing: -0.02em; }
    .slide-sub { font-size: clamp(15px, 2.2vw, 26px); opacity: 0.65; margin-bottom: 20px; font-weight: 400; }
    .slide-body { font-size: clamp(13px, 1.8vw, 18px); line-height: 1.65; opacity: 0.82; }
    #caption-bar { position: absolute; bottom: 64px; left: 0; right: 0; padding: 10px 24px; text-align: center; pointer-events: none; }
    #caption-text { display: inline-block; background: ${c.cap}; backdrop-filter: blur(10px); color: ${c.text}; font-size: 14px; line-height: 1.5; padding: 7px 14px; border-radius: 8px; max-width: 720px; }
    #caption-text:empty { display: none; }
    #controls { position: absolute; bottom: 0; left: 0; right: 0; height: 56px; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 0 16px; background: ${c.cap}; backdrop-filter: blur(10px); }
    .cbtn { width: 34px; height: 34px; border: none; border-radius: 50%; background: ${c.ctrl}; color: ${c.text}; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; transition: background 0.18s; flex-shrink: 0; }
    .cbtn:hover { background: ${c.ctrlH}; }
    .cbtn:disabled { opacity: 0.28; cursor: default; }
    #slide-counter { font-size: 11px; opacity: 0.45; min-width: 44px; text-align: center; }
    #progress-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: rgba(128,128,128,0.15); }
    #progress-fill { height: 100%; background: ${c.accent}; width: 0%; }
    #vol-btn { font-size: 14px; }
  </style>
</head>
<body>
<div id="slideshow">
  <div id="slides-container">
${slidesMarkup}
  </div>
  <div id="caption-bar"><p id="caption-text"></p></div>
  <div id="progress-bar"><div id="progress-fill"></div></div>
  <div id="controls">
    <button class="cbtn" id="btn-prev" title="Previous (←)">&#9664;</button>
    <button class="cbtn" id="btn-pp" title="Play / Pause (Space)">&#9654;</button>
    <button class="cbtn" id="btn-next" title="Next (→)">&#9654;</button>
    <span id="slide-counter">1 / ${slides.length}</span>
    <button class="cbtn" id="vol-btn" title="Mute / Unmute">&#128266;</button>
  </div>
</div>
<audio id="slide-audio" preload="auto"></audio>
<script>
  const audioData = ${audioDataJson};
  const TOTAL = ${slides.length};
  const LOOP = ${loop ? 'true' : 'false'};
  const slideEls = document.querySelectorAll('.slide');
  const audio = document.getElementById('slide-audio');
  const captionEl = document.getElementById('caption-text');
  const counterEl = document.getElementById('slide-counter');
  const pfill = document.getElementById('progress-fill');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnPP = document.getElementById('btn-pp');
  const btnVol = document.getElementById('vol-btn');

  let cur = 0, playing = false, muted = false;
  let rafId = null, timerStart = 0, timerDur = 0, timerHandle = null;

  function dur(i) { return parseInt(slideEls[i]?.dataset.duration || '5000', 10); }
  function cap(i) { return slideEls[i]?.dataset.caption || ''; }

  function updateUI() {
    captionEl.textContent = cap(cur);
    counterEl.textContent = (cur + 1) + ' / ' + TOTAL;
    btnPrev.disabled = cur === 0;
    btnNext.disabled = cur === TOTAL - 1 && !LOOP;
    btnPP.innerHTML = playing ? '&#9646;&#9646;' : '&#9654;';
    btnVol.innerHTML = muted ? '&#128263;' : '&#128266;';
  }

  function startProgressRaf(duration) {
    if (rafId) cancelAnimationFrame(rafId);
    timerStart = performance.now();
    timerDur = duration;
    function tick() {
      const pct = Math.min(100, ((performance.now() - timerStart) / timerDur) * 100);
      pfill.style.width = pct + '%';
      if (pct < 100) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }

  function stopProgress() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    clearTimeout(timerHandle);
  }

  function resetProgress() { stopProgress(); pfill.style.width = '0%'; }

  function goTo(index, fromAdvance) {
    stopProgress();
    const prev = slideEls[cur];
    if (prev) prev.classList.remove('active');
    cur = ((index % TOTAL) + TOTAL) % TOTAL;
    slideEls[cur].classList.add('active');

    const src = audioData[cur];
    audio.pause();
    if (src) { audio.src = src; audio.muted = muted; audio.load(); }
    else audio.src = '';

    updateUI();

    if (playing) {
      const d = dur(cur);
      if (src) {
        audio.play().catch(() => {});
        startProgressRaf(d);
      } else {
        startProgressRaf(d);
        timerHandle = setTimeout(() => {
          if (cur < TOTAL - 1 || LOOP) goTo(cur + 1, true);
          else pause();
        }, d);
      }
    } else {
      resetProgress();
    }
  }

  function play() {
    playing = true;
    const src = audioData[cur];
    const d = dur(cur);
    if (src) { audio.muted = muted; audio.play().catch(() => {}); startProgressRaf(d); }
    else { startProgressRaf(d); timerHandle = setTimeout(() => { if(cur < TOTAL-1||LOOP) goTo(cur+1,true); else pause(); }, d); }
    updateUI();
  }

  function pause() {
    playing = false;
    audio.pause();
    stopProgress();
    updateUI();
  }

  audio.addEventListener('ended', () => {
    if (!playing) return;
    if (cur < TOTAL - 1 || LOOP) goTo(cur + 1, true);
    else pause();
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.duration > 0 && playing) {
      pfill.style.width = ((audio.currentTime / audio.duration) * 100) + '%';
    }
  });

  btnPrev.addEventListener('click', () => { if (cur > 0) goTo(cur - 1); });
  btnNext.addEventListener('click', () => { if (cur < TOTAL - 1 || LOOP) goTo(cur + 1); });
  btnPP.addEventListener('click', () => { if (playing) pause(); else play(); });
  btnVol.addEventListener('click', () => { muted = !muted; audio.muted = muted; updateUI(); });

  document.addEventListener('keydown', e => {
    if (e.key === ' ') { e.preventDefault(); if (playing) pause(); else play(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { if(cur<TOTAL-1||LOOP) goTo(cur+1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { if(cur>0) goTo(cur-1); }
    else if (e.key === 'm') { muted = !muted; audio.muted = muted; updateUI(); }
  });

  updateUI();
  resetProgress();
  ${autoplay ? 'setTimeout(() => play(), 600);' : ''}
</script>
</body>
</html>`;
}

// ── create_narrated_slideshow ─────────────────────────────────────────────────

export const createNarratedSlideshowTool = {
  name: 'create_narrated_slideshow',
  description:
    'Create a self-contained narrated slideshow as an HTML artifact. Combines slide content (title, subtitle, body HTML) with optional per-slide TTS audio files that are base64-embedded for offline playback. Includes a progress bar, play/pause/next/prev controls, caption overlays, and keyboard shortcuts. Ideal for 30–60 second explainer videos, product demos, and presentations. Use speak_text first to generate the audio files, then pass their paths here.',
  category: 'design',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Slideshow title.' },
      filename: { type: 'string', description: 'Output filename. Should end in .html.' },
      slides: {
        type: 'array',
        description: 'Ordered list of slides.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Slide headline.' },
            subtitle: { type: 'string', description: 'Slide sub-headline or tagline.' },
            body: { type: 'string', description: 'Main slide content (can include simple HTML tags).' },
            caption: { type: 'string', description: 'Closed-caption / subtitle text shown at the bottom during this slide.' },
            audio_path: { type: 'string', description: 'Relative path to a WAV/MP3 audio file for this slide (generated by speak_text). Embedded as base64.' },
            duration_ms: { type: 'number', description: 'Slide duration in milliseconds when no audio is present (default: 5000).' },
            bg_color: { type: 'string', description: 'CSS background color for this slide.' },
            text_color: { type: 'string', description: 'CSS text color for this slide.' },
          },
        },
      },
      theme: {
        type: 'string',
        enum: ['dark', 'light', 'brand'],
        description: 'Color theme (default: dark).',
      },
      transition: {
        type: 'string',
        enum: ['fade', 'none'],
        description: 'Slide transition (default: fade).',
      },
      autoplay: { type: 'boolean', description: 'Start playing automatically on load (default: false).' },
      loop: { type: 'boolean', description: 'Loop back to slide 1 after the last slide (default: false).' },
    },
    required: ['title', 'slides'],
  },
  execute: async (args, context) => {
    try {
      if (!Array.isArray(args.slides) || args.slides.length === 0) {
        return { success: false, error: 'At least one slide is required.' };
      }

      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const id = randomUUID().slice(0, 10);
      const rawFilename = normalizeFilename(args.filename, args.title, 'html');
      const parsed = path.parse(rawFilename);
      const filename = `${parsed.name}_${id}.html`;
      const filePath = path.join(artifactsDir, filename);

      // Load and base64-encode audio files
      const slidesWithAudio = args.slides.map(slide => {
        if (!slide.audio_path) return slide;
        try {
          const audioAbs = path.resolve(context.workingDir, slide.audio_path);
          if (!isPathInside(audioAbs, context.workingDir)) return slide;
          if (!fs.existsSync(audioAbs)) return slide;
          const buf = fs.readFileSync(audioAbs);
          const ext = path.extname(slide.audio_path).toLowerCase().slice(1);
          const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : 'audio/wav';
          return { ...slide, _audioBase64: `data:${mime};base64,${buf.toString('base64')}` };
        } catch {
          return slide;
        }
      });

      const content = buildNarratedSlideshowHtml({
        title: args.title,
        slides: slidesWithAudio,
        theme: args.theme || 'dark',
        autoplay: args.autoplay || false,
        loop: args.loop || false,
        transition: args.transition || 'fade',
      });

      fs.writeFileSync(filePath, content, 'utf8');
      const stat = fs.statSync(filePath);
      const relativePath = artifactRelativePath(context.workingDir, filePath);
      const audioCount = slidesWithAudio.filter(s => s._audioBase64).length;

      return {
        success: true,
        artifact: {
          id,
          title: args.title,
          filename,
          path: relativePath,
          absolutePath: filePath,
          type: 'animation',
          originalType: 'html',
          description: `Narrated slideshow: ${args.slides.length} slides${audioCount ? `, ${audioCount} with audio` : ''}`,
          size: stat.size,
          createdAt: new Date().toISOString(),
        },
        slideshow: {
          slideCount: args.slides.length,
          audioEmbedded: audioCount,
          theme: args.theme || 'dark',
          transition: args.transition || 'fade',
        },
        message: `Narrated slideshow "${args.title}" created: ${relativePath} (${formatSize(stat.size)}, ${args.slides.length} slides, ${audioCount} audio tracks)`,
      };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to create narrated slideshow.' };
    }
  },
};

// ── render_video ──────────────────────────────────────────────────────────────

export const renderVideoTool = {
  name: 'render_video',
  description:
    'Render an MP4 video using FFmpeg. Requires FFmpeg to be installed (brew install ffmpeg / apt install ffmpeg). ' +
    'Modes: "image-audio" combines a still image with an audio narration track into an MP4; "image-sequence" converts an ordered list of image frames into a video (optionally with audio). ' +
    'Returns a video artifact that can be played and downloaded from the UI.',
  category: 'design',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Video title.' },
      filename: { type: 'string', description: 'Output filename. Should end in .mp4.' },
      mode: {
        type: 'string',
        enum: ['image-audio', 'image-sequence'],
        description: '"image-audio": still image + audio → MP4. "image-sequence": ordered image frames → MP4.',
      },
      image: { type: 'string', description: 'Path to still image (for image-audio mode, relative to working dir).' },
      images: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ordered list of image paths (for image-sequence mode, relative to working dir).',
      },
      audio: { type: 'string', description: 'Path to audio file (WAV, MP3) to add as the video soundtrack.' },
      fps: { type: 'number', description: 'Frames per second for image-sequence mode (default: 24).' },
      width: { type: 'number', description: 'Output width in pixels, must be even (default: 1280).' },
      height: { type: 'number', description: 'Output height in pixels, must be even (default: 720).' },
    },
    required: ['title', 'mode'],
  },
  execute: async (args, context) => {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    // Verify ffmpeg is available
    try {
      await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    } catch {
      return {
        success: false,
        error: 'FFmpeg not found. Install it first: macOS → "brew install ffmpeg", Ubuntu → "sudo apt install ffmpeg", then restart the server.',
      };
    }

    try {
      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const id = randomUUID().slice(0, 10);
      const baseName = slugify(args.filename ? path.parse(args.filename).name : args.title);
      const filename = `${baseName}_${id}.mp4`;
      const filePath = path.join(artifactsDir, filename);

      const w = Math.round((args.width || 1280) / 2) * 2;
      const h = Math.round((args.height || 720) / 2) * 2;
      const scaleFilter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`;

      let ffArgs;
      let tmpList = null;

      if (args.mode === 'image-audio') {
        if (!args.image) return { success: false, error: '"image-audio" mode requires an "image" path.' };
        if (!args.audio) return { success: false, error: '"image-audio" mode requires an "audio" path.' };
        const imgPath = safePath(args.image, context.workingDir);
        const audPath = safePath(args.audio, context.workingDir);
        if (!fs.existsSync(imgPath)) return { success: false, error: `Image not found: ${args.image}` };
        if (!fs.existsSync(audPath)) return { success: false, error: `Audio not found: ${args.audio}` };
        ffArgs = [
          '-loop', '1', '-i', imgPath,
          '-i', audPath,
          '-c:v', 'libx264', '-tune', 'stillimage',
          '-c:a', 'aac', '-b:a', '192k',
          '-pix_fmt', 'yuv420p',
          '-vf', scaleFilter,
          '-shortest', '-movflags', '+faststart',
          '-y', filePath,
        ];
      } else if (args.mode === 'image-sequence') {
        if (!Array.isArray(args.images) || args.images.length === 0) {
          return { success: false, error: '"image-sequence" mode requires an "images" array.' };
        }
        const fps = args.fps || 24;
        tmpList = path.join(context.workingDir, `.ffmpeg_list_${id}.txt`);
        const dur = (1 / fps).toFixed(6);
        const lastImg = safePath(args.images[args.images.length - 1], context.workingDir);
        const listContent = args.images
          .map(img => `file '${safePath(img, context.workingDir)}'\nduration ${dur}`)
          .join('\n') + `\nfile '${lastImg}'`;
        fs.writeFileSync(tmpList, listContent, 'utf8');
        ffArgs = [
          '-f', 'concat', '-safe', '0', '-i', tmpList,
          ...(args.audio ? ['-i', safePath(args.audio, context.workingDir)] : []),
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-vf', scaleFilter,
          '-r', String(fps),
          ...(args.audio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
          '-movflags', '+faststart',
          '-y', filePath,
        ];
      } else {
        return { success: false, error: `Unknown mode: ${args.mode}. Use "image-audio" or "image-sequence".` };
      }

      try {
        await execFileAsync('ffmpeg', ffArgs, { timeout: 300000 });
      } finally {
        if (tmpList) { try { fs.unlinkSync(tmpList); } catch {} }
      }

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
          type: 'video',
          size: stat.size,
          createdAt: new Date().toISOString(),
          mode: args.mode,
        },
        message: `Video "${args.title}" rendered: ${relativePath} (${formatSize(stat.size)})`,
      };
    } catch (err) {
      return { success: false, error: `FFmpeg render failed: ${err.stderr?.toString() || err.message}` };
    }
  },
};

export const designTools = [
  inspectDesignSystemTool,
  createDesignCanvasTool,
  createCodeAnimationTool,
  createDesignHandoffTool,
  createNarratedSlideshowTool,
  renderVideoTool,
];

export default designTools;
