// den/src/agent/tools/socialTools.js
// ─── Social & Creative Visual Tools ─────────────────────────────────────────
// Social cards, infographics, carousels, typographic posters, and image
// composition. Uses Puppeteer (HTML→PNG) and node-canvas (pixel composition).
// Both are already installed. Works on macOS, Windows, and Linux.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import { PermissionLevel } from './toolRegistry.js';
import { safePath, formatSize, isPathInside } from './shared.js';
import { getArtifactsDir } from '../workspacePaths.js';

// ── Platform size presets ────────────────────────────────────────────────────

const PLATFORM_SIZES = {
  'instagram-square':   { w: 1080, h: 1080,  label: 'Instagram Square (1:1)' },
  'instagram-portrait': { w: 1080, h: 1350,  label: 'Instagram Portrait (4:5)' },
  'story':              { w: 1080, h: 1920,  label: 'Story / Reel (9:16)' },
  'twitter':            { w: 1200, h: 675,   label: 'Twitter / X (16:9)' },
  'linkedin':           { w: 1200, h: 627,   label: 'LinkedIn (1.91:1)' },
  'og-image':           { w: 1200, h: 630,   label: 'Open Graph' },
  'youtube-thumb':      { w: 1280, h: 720,   label: 'YouTube Thumbnail' },
  'facebook':           { w: 1200, h: 630,   label: 'Facebook' },
};

// ── Shared helpers ───────────────────────────────────────────────────────────

function ensureArtifactsDir(workingDir) {
  const dir = getArtifactsDir(workingDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(text, fallback = 'asset') {
  return String(text || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56) || fallback;
}

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function imageToBase64(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch { return null; }
}

// ── Puppeteer screenshot helper ──────────────────────────────────────────────
// Cross-platform: headless Chrome with no-sandbox args works on all OSes.

async function screenshotHtmlToPng(html, outputPath, { width, height } = {}) {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    throw new Error('Puppeteer is not available. It should already be installed as a dependency — check "npm install" in the den directory.');
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 120)); // let CSS transitions settle
    await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width, height } });
  } finally {
    await browser.close().catch(() => {});
  }
}

// ── Social Card HTML builder ─────────────────────────────────────────────────
// Produces pixel-exact HTML for any platform size and style.

function buildSocialCardHtml({ w, h, headline, subheadline, body, bgColor, textColor, accentColor, logoText, style, bgImageBase64 }) {
  const pad = Math.round(w * 0.09);
  const hlSize  = Math.round(w * 0.064);
  const subSize = Math.round(w * 0.024);
  const bdSize  = Math.round(w * 0.021);
  const lgSize  = Math.round(w * 0.017);
  const bg     = bgColor    || '#ffffff';
  const fg     = textColor  || '#111111';
  const accent = accentColor || '#4f46e5';

  const bgCss = bgImageBase64
    ? `background:url('${bgImageBase64}') center/cover no-repeat;`
    : `background:${bg};`;

  const overlay = bgImageBase64 ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.46)"></div>` : '';

  const styleMap = {
    clean: `
      .card{${bgCss}display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${pad}px;position:relative}
      .aline{width:52px;height:5px;background:${accent};border-radius:3px;margin-bottom:${Math.round(pad*.7)}px}
      .hl{font-size:${hlSize}px;font-weight:800;color:${fg};line-height:1.08;letter-spacing:-.03em}
      .sub{font-size:${subSize}px;color:${fg};opacity:.55;margin-top:${Math.round(pad*.55)}px;font-weight:500;line-height:1.4}
      .bd{font-size:${bdSize}px;color:${fg};opacity:.4;margin-top:${Math.round(pad*.4)}px;line-height:1.55}
      .logo{position:absolute;bottom:${Math.round(pad*.7)}px;font-size:${lgSize}px;font-weight:700;color:${accent};letter-spacing:.07em;text-transform:uppercase}`,
    bold: `
      .card{${bgCss}display:flex;align-items:center;justify-content:flex-start;position:relative;overflow:hidden}
      .card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:${Math.round(w*.011)}px;background:${accent}}
      .inner{padding:${pad}px ${pad}px ${pad}px ${pad+Math.round(w*.016)}px}
      .eyebrow{font-size:${Math.round(w*.016)}px;font-weight:800;color:${accent};text-transform:uppercase;letter-spacing:.12em;margin-bottom:${Math.round(pad*.4)}px}
      .hl{font-size:${Math.round(hlSize*1.22)}px;font-weight:900;color:${fg};line-height:.92;letter-spacing:-.04em}
      .sub{font-size:${subSize}px;color:${fg};opacity:.45;margin-top:${Math.round(pad*.45)}px;font-weight:400}
      .logo{position:absolute;bottom:${Math.round(pad*.6)}px;right:${Math.round(pad*.6)}px;font-size:${lgSize}px;font-weight:700;color:${fg};opacity:.35;letter-spacing:.06em;text-transform:uppercase}`,
    gradient: `
      .card{background:linear-gradient(135deg,${bg||'#4f46e5'} 0%,${accent} 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${pad}px;position:relative}
      .card::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 28% 28%,rgba(255,255,255,.13),transparent 58%)}
      .inner{position:relative;z-index:1}
      .hl{font-size:${hlSize}px;font-weight:800;color:#fff;line-height:1.08;letter-spacing:-.03em;text-shadow:0 2px 24px rgba(0,0,0,.18)}
      .sub{font-size:${subSize}px;color:rgba(255,255,255,.82);margin-top:${Math.round(pad*.55)}px;font-weight:400;line-height:1.45}
      .bd{font-size:${bdSize}px;color:rgba(255,255,255,.62);margin-top:${Math.round(pad*.35)}px;line-height:1.55}
      .logo{position:absolute;bottom:${Math.round(pad*.65)}px;font-size:${lgSize}px;font-weight:700;color:rgba(255,255,255,.58);letter-spacing:.07em;text-transform:uppercase}`,
    dark: `
      .card{background:${bg||'#0a0a0a'};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${pad}px;position:relative}
      .ring{width:${Math.round(w*.11)}px;height:${Math.round(w*.11)}px;border-radius:50%;border:3px solid ${accent};display:flex;align-items:center;justify-content:center;margin-bottom:${Math.round(pad*.6)}px}
      .dot{width:${Math.round(w*.024)}px;height:${Math.round(w*.024)}px;border-radius:50%;background:${accent}}
      .hl{font-size:${hlSize}px;font-weight:800;color:${fg||'#fff'};line-height:1.08;letter-spacing:-.03em}
      .sub{font-size:${subSize}px;color:${fg||'#fff'};opacity:.42;margin-top:${Math.round(pad*.55)}px}
      .bd{font-size:${bdSize}px;color:${fg||'#fff'};opacity:.3;margin-top:${Math.round(pad*.35)}px;line-height:1.55}
      .logo{position:absolute;bottom:${Math.round(pad*.65)}px;font-size:${lgSize}px;font-weight:700;color:${accent};letter-spacing:.08em;text-transform:uppercase}`,
    glass: `
      .card{background:${bg||'#0f172a'};display:flex;align-items:center;justify-content:center;padding:${Math.round(pad*.7)}px;position:relative;overflow:hidden}
      .card::before{content:'';position:absolute;top:-30%;right:-18%;width:58%;height:88%;border-radius:50%;background:radial-gradient(circle,${accent}44,transparent 70%)}
      .panel{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:${Math.round(w*.038)}px;backdrop-filter:blur(20px);padding:${Math.round(pad*.85)}px;position:relative;z-index:1;width:100%;text-align:center}
      .hl{font-size:${Math.round(hlSize*.9)}px;font-weight:800;color:${fg||'#fff'};line-height:1.1;letter-spacing:-.03em}
      .sub{font-size:${subSize}px;color:rgba(255,255,255,.52);margin-top:${Math.round(pad*.45)}px;line-height:1.4}
      .bd{font-size:${bdSize}px;color:rgba(255,255,255,.36);margin-top:${Math.round(pad*.28)}px;line-height:1.55}
      .logo{margin-top:${Math.round(pad*.55)}px;font-size:${lgSize}px;font-weight:700;color:${accent};letter-spacing:.08em;text-transform:uppercase}`,
  };

  const css = styleMap[style] || styleMap.clean;

  // Build inner markup per style
  let markup = '';
  if (style === 'bold') {
    markup = `<div class="inner">
      ${subheadline ? `<p class="eyebrow">${esc(subheadline)}</p>` : ''}
      ${headline    ? `<h1 class="hl">${esc(headline)}</h1>` : ''}
      ${body        ? `<p class="sub">${esc(body)}</p>` : ''}
    </div>
    ${logoText ? `<div class="logo">${esc(logoText)}</div>` : ''}`;
  } else if (style === 'dark') {
    markup = `<div class="ring"><div class="dot"></div></div>
    <div style="text-align:center">
      ${headline    ? `<h1 class="hl">${esc(headline)}</h1>` : ''}
      ${subheadline ? `<p class="sub">${esc(subheadline)}</p>` : ''}
      ${body        ? `<p class="bd">${esc(body)}</p>` : ''}
    </div>
    ${logoText ? `<div class="logo">${esc(logoText)}</div>` : ''}`;
  } else if (style === 'glass') {
    markup = `<div class="panel">
      ${headline    ? `<h1 class="hl">${esc(headline)}</h1>` : ''}
      ${subheadline ? `<p class="sub">${esc(subheadline)}</p>` : ''}
      ${body        ? `<p class="bd">${esc(body)}</p>` : ''}
      ${logoText    ? `<div class="logo">${esc(logoText)}</div>` : ''}
    </div>`;
  } else {
    // clean, gradient
    markup = `${style === 'clean' ? '<div class="aline"></div>' : ''}
    <div class="inner">
      ${headline    ? `<h1 class="hl">${esc(headline)}</h1>` : ''}
      ${subheadline ? `<p class="sub">${esc(subheadline)}</p>` : ''}
      ${body        ? `<p class="bd">${esc(body)}</p>` : ''}
    </div>
    ${logoText ? `<div class="logo">${esc(logoText)}</div>` : ''}`;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif}
.card{width:${w}px;height:${h}px;position:relative}
${css}
</style></head><body>
<div class="card">${overlay}${markup}</div>
</body></html>`;
}

// ── Infographic HTML builder ─────────────────────────────────────────────────

function buildInfographicHtml({ w = 1200, h = 675, title, subtitle, type, data, colorScheme }) {
  const schemes = {
    blue:   { a: '#3b82f6', a2: '#1d4ed8', light: '#dbeafe', bg: '#ffffff', fg: '#111827', muted: '#6b7280', dark: false },
    purple: { a: '#8b5cf6', a2: '#6d28d9', light: '#ede9fe', bg: '#ffffff', fg: '#111827', muted: '#6b7280', dark: false },
    green:  { a: '#22c55e', a2: '#15803d', light: '#dcfce7', bg: '#ffffff', fg: '#111827', muted: '#6b7280', dark: false },
    orange: { a: '#f97316', a2: '#c2410c', light: '#fed7aa', bg: '#ffffff', fg: '#111827', muted: '#6b7280', dark: false },
    red:    { a: '#ef4444', a2: '#b91c1c', light: '#fee2e2', bg: '#ffffff', fg: '#111827', muted: '#6b7280', dark: false },
    dark:   { a: '#6366f1', a2: '#4338ca', light: 'rgba(255,255,255,.06)', bg: '#0f172a', fg: '#f1f5f9', muted: 'rgba(241,245,249,.5)', dark: true },
  };
  const s = schemes[colorScheme] || schemes.blue;
  const pad = Math.round(w * 0.055);
  const items = Array.isArray(data) ? data : [];

  let body = '';

  switch (type) {
    case 'stats': {
      const cols = items.length <= 3 ? items.length : Math.min(items.length, 4);
      body = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${Math.round(pad*.45)}px">
        ${items.slice(0, 8).map((item, i) => {
          const ic = item.color || [s.a, s.a2, '#06b6d4', '#8b5cf6', '#f97316', '#22c55e', '#ec4899', '#f59e0b'][i % 8];
          return `<div style="background:${s.light};border-radius:14px;padding:${Math.round(pad*.65)}px;text-align:center;border:1px solid ${s.dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.04)'}">
            <div style="font-size:${Math.round(w*.052)}px;font-weight:900;color:${ic};line-height:1;letter-spacing:-.03em">${esc(String(item.value ?? ''))}</div>
            <div style="font-size:${Math.round(w*.017)}px;color:${s.muted};margin-top:8px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">${esc(String(item.label ?? ''))}</div>
            ${item.change ? `<div style="font-size:${Math.round(w*.014)}px;color:${item.change.startsWith('+') ? '#22c55e' : '#ef4444'};margin-top:4px;font-weight:700">${esc(item.change)}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
      break;
    }
    case 'timeline': {
      body = `<div style="display:flex;flex-direction:column;gap:0">
        ${items.slice(0, 7).map((item, i) => `
          <div style="display:flex;gap:${Math.round(pad*.45)}px;align-items:flex-start">
            <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:38px">
              <div style="width:36px;height:36px;border-radius:50%;background:${i === 0 ? s.a : s.light};border:2px solid ${s.a};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:${i === 0 ? '#fff' : s.a};flex-shrink:0">${i+1}</div>
              ${i < items.length - 1 ? `<div style="width:2px;flex:1;min-height:20px;background:${s.dark ? 'rgba(255,255,255,.1)' : '#e5e7eb'};margin:4px 0"></div>` : ''}
            </div>
            <div style="padding-bottom:${Math.round(pad*.45)}px;flex:1">
              ${item.date ? `<div style="font-size:${Math.round(w*.013)}px;font-weight:700;color:${s.a};text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">${esc(String(item.date))}</div>` : ''}
              <div style="font-size:${Math.round(w*.021)}px;font-weight:700;color:${s.fg}">${esc(String(item.title ?? item.event ?? ''))}</div>
              ${item.description ? `<div style="font-size:${Math.round(w*.016)}px;color:${s.muted};margin-top:3px;line-height:1.5">${esc(item.description)}</div>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
      break;
    }
    case 'comparison': {
      const maxVal = Math.max(...items.map(it => Number(it.value ?? it.score ?? 0)), 1);
      body = `<div style="display:flex;flex-direction:column;gap:${Math.round(pad*.28)}px">
        ${items.slice(0, 8).map((item, i) => {
          const val = Number(item.value ?? item.score ?? 0);
          const pct = Math.round((val / maxVal) * 100);
          const ic = item.color || [s.a, s.a2, '#06b6d4', '#8b5cf6', '#f97316', '#22c55e'][i % 6];
          return `<div style="display:flex;align-items:center;gap:14px">
            <div style="min-width:${Math.round(w*.18)}px;font-size:${Math.round(w*.017)}px;font-weight:600;color:${s.fg};text-align:right">${esc(String(item.label ?? ''))}</div>
            <div style="flex:1;height:28px;background:${s.dark ? 'rgba(255,255,255,.07)' : '#f3f4f6'};border-radius:8px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${ic},${ic}cc);border-radius:8px;display:flex;align-items:center;justify-content:flex-end;padding:0 10px;transition:width .3s">
                <span style="font-size:12px;font-weight:700;color:#fff;white-space:nowrap">${esc(String(item.value ?? item.score ?? ''))}</span>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
      break;
    }
    case 'list': {
      const cols = items.length > 4 ? 2 : 1;
      const listHtml = items.slice(0, 8).map((item, i) => `
        <div style="display:flex;gap:14px;align-items:flex-start;padding:${Math.round(pad*.32)}px;background:${s.light};border-radius:12px">
          <div style="width:36px;height:36px;border-radius:10px;background:${s.a};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px">
            ${item.icon ? esc(item.icon) : `<span style="font-size:13px;font-weight:800;color:#fff">${String(i+1).padStart(2,'0')}</span>`}
          </div>
          <div>
            <div style="font-size:${Math.round(w*.019)}px;font-weight:700;color:${s.fg}">${esc(String(item.title ?? ''))}</div>
            ${item.description ? `<div style="font-size:${Math.round(w*.015)}px;color:${s.muted};margin-top:2px;line-height:1.45">${esc(item.description)}</div>` : ''}
          </div>
        </div>`).join('');
      body = cols === 2
        ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:${Math.round(pad*.32)}px">${listHtml}</div>`
        : `<div style="display:flex;flex-direction:column;gap:${Math.round(pad*.32)}px">${listHtml}</div>`;
      break;
    }
    case 'flow': {
      const isHoriz = items.length <= 5;
      body = `<div style="display:flex;${isHoriz ? '' : 'flex-direction:column;'}align-items:${isHoriz ? 'flex-start' : 'stretch'};gap:0;flex-wrap:wrap">
        ${items.slice(0, 7).map((item, i) => `
          <div style="display:flex;align-items:center;gap:0;flex:${isHoriz ? '1' : 'none'}">
            <div style="text-align:center;padding:${Math.round(pad*.35)}px;min-width:${Math.round(w*.12)}px;flex:1">
              <div style="width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,${s.a},${s.a2});display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:20px">
                ${item.icon ? esc(item.icon) : `<span style="font-weight:800;font-size:17px;color:#fff">${i+1}</span>`}
              </div>
              <div style="font-size:${Math.round(w*.018)}px;font-weight:700;color:${s.fg}">${esc(String(item.label ?? item.title ?? ''))}</div>
              ${item.description ? `<div style="font-size:${Math.round(w*.014)}px;color:${s.muted};margin-top:4px;line-height:1.4">${esc(item.description)}</div>` : ''}
            </div>
            ${i < items.length - 1 ? `<div style="color:${s.a};font-size:22px;font-weight:700;flex-shrink:0;padding:0 4px">${isHoriz ? '→' : ''}</div>` : ''}
          </div>`).join('')}
      </div>`;
      break;
    }
    default:
      body = `<pre style="font-size:13px;color:${s.fg};white-space:pre-wrap;opacity:.8">${esc(JSON.stringify(data, null, 2).slice(0, 2000))}</pre>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;min-height:${h}px;background:${s.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;overflow:hidden}
</style></head><body style="padding:${pad}px">
  <div style="margin-bottom:${Math.round(pad*.55)}px;padding-bottom:${Math.round(pad*.38)}px;border-bottom:1px solid ${s.dark ? 'rgba(255,255,255,.08)' : '#f1f5f9'};display:flex;flex-direction:column;gap:4px">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:4px;height:${Math.round(w*.026)}px;background:${s.a};border-radius:2px;flex-shrink:0"></div>
      <h1 style="font-size:${Math.round(w*.026)}px;font-weight:800;color:${s.fg};letter-spacing:-.02em">${esc(title)}</h1>
    </div>
    ${subtitle ? `<p style="font-size:${Math.round(w*.016)}px;color:${s.muted};padding-left:14px">${esc(subtitle)}</p>` : ''}
  </div>
  ${body}
</body></html>`;
}

// ── Typographic Poster HTML builder ─────────────────────────────────────────

function buildTypographicPosterHtml({ w, h, headline, subheadline, body, author, bgColor, textColor, accentColor, style }) {
  const bg     = bgColor    || (style === 'neon' ? '#050014' : style === 'bold' ? '#000000' : style === 'retro' ? '#f5e6c8' : '#ffffff');
  const fg     = textColor  || (style === 'neon' || style === 'bold' ? '#ffffff' : style === 'retro' ? '#2d1b0e' : '#111111');
  const accent = accentColor || '#4f46e5';
  const pad    = Math.round(w * 0.1);
  const hlSize = Math.round(w * 0.088);
  const subSz  = Math.round(w * 0.025);
  const bdSz   = Math.round(w * 0.021);
  const authSz = Math.round(w * 0.017);

  const templates = {
    editorial: {
      css: `
        .p{background:${bg};padding:${pad}px;display:flex;flex-direction:column;height:${h}px}
        .rule-t{width:100%;height:3px;background:${fg};margin-bottom:${Math.round(pad*.45)}px}
        .hl{font-size:${hlSize}px;font-weight:900;color:${fg};line-height:.88;letter-spacing:-.05em;text-transform:uppercase}
        .sub{font-size:${subSz}px;color:${fg};opacity:.5;margin-top:${Math.round(pad*.38)}px;border-left:3px solid ${accent};padding-left:14px;font-style:italic;line-height:1.55}
        .bd{font-size:${bdSz}px;color:${fg};opacity:.55;margin-top:${Math.round(pad*.38)}px;line-height:1.65;columns:${w > 700 ? 2 : 1};column-gap:${Math.round(pad*.45)}px}
        .auth{margin-top:auto;font-size:${authSz}px;font-weight:700;color:${fg};opacity:.38;text-transform:uppercase;letter-spacing:.1em}
        .rule-b{width:100%;height:1px;background:${fg};opacity:.15;margin-top:${Math.round(pad*.28)}px}`,
      html: `<div class="rule-t"></div>
        ${headline    ? `<h1 class="hl">${esc(headline)}</h1>` : ''}
        ${subheadline ? `<p class="sub">${esc(subheadline)}</p>` : ''}
        ${body        ? `<div class="bd">${esc(body)}</div>` : ''}
        ${author      ? `<p class="auth">— ${esc(author)}</p>` : ''}<div class="rule-b"></div>`,
    },
    swiss: {
      css: `
        .p{background:${bg};padding:${pad}px;display:grid;grid-template-rows:auto 1fr auto;height:${h}px}
        .gline{width:100%;height:1px;background:${fg};opacity:.14;margin-bottom:${Math.round(pad*.45)}px}
        .hl{font-size:${Math.round(hlSize*1.08)}px;font-weight:700;color:${fg};line-height:.92;letter-spacing:-.04em}
        .dot{display:inline-block;width:${Math.round(w*.011)}px;height:${Math.round(w*.011)}px;border-radius:50%;background:${accent};vertical-align:super;margin-left:8px}
        .sub{font-size:${subSz}px;color:${accent};margin-top:${Math.round(pad*.48)}px;font-weight:600;letter-spacing:.02em}
        .bd{font-size:${bdSz}px;color:${fg};opacity:.5;line-height:1.65;margin-top:${Math.round(pad*.3)}px}
        .auth{font-size:${authSz}px;color:${fg};opacity:.32;font-weight:500;letter-spacing:.08em;text-transform:uppercase}`,
      html: `<div>
          <div class="gline"></div>
          ${headline ? `<h1 class="hl">${esc(headline)}<span class="dot"></span></h1>` : ''}
        </div>
        <div>
          ${subheadline ? `<p class="sub">${esc(subheadline)}</p>` : ''}
          ${body        ? `<p class="bd">${esc(body)}</p>` : ''}
        </div>
        ${author ? `<p class="auth">${esc(author)}</p>` : ''}`,
    },
    bold: {
      css: `
        .p{background:${bg};padding:${pad}px;display:flex;flex-direction:column;justify-content:center;height:${h}px}
        .rule{width:${Math.round(w*.08)}px;height:6px;background:${accent};border-radius:3px;margin-bottom:${Math.round(pad*.45)}px}
        .hl{font-size:${Math.round(hlSize*1.28)}px;font-weight:900;color:${fg};line-height:.84;letter-spacing:-.05em;text-transform:uppercase}
        .sub{font-size:${Math.round(subSz*1.1)}px;color:${fg};opacity:.4;margin-top:${Math.round(pad*.45)}px;font-weight:400}
        .bd{font-size:${bdSz}px;color:${fg};opacity:.28;margin-top:${Math.round(pad*.35)}px;line-height:1.6}
        .auth{font-size:${authSz}px;color:${fg};opacity:.28;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-top:auto;padding-top:${Math.round(pad*.5)}px}`,
      html: `<div class="rule"></div>
        ${headline    ? `<h1 class="hl">${esc(headline)}</h1>` : ''}
        ${subheadline ? `<p class="sub">${esc(subheadline)}</p>` : ''}
        ${body        ? `<p class="bd">${esc(body)}</p>` : ''}
        ${author      ? `<p class="auth">${esc(author)}</p>` : ''}`,
    },
    retro: {
      css: `
        .p{background:${bg};padding:${pad}px;display:flex;flex-direction:column;align-items:center;text-align:center;height:${h}px;position:relative}
        .ob{position:absolute;inset:${Math.round(pad*.28)}px;border:2px solid ${fg};opacity:.22;pointer-events:none}
        .ib{position:absolute;inset:${Math.round(pad*.42)}px;border:1px solid ${fg};opacity:.1;pointer-events:none}
        .badge{background:${accent};color:#fff;font-size:${Math.round(w*.014)}px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:6px 18px;border-radius:100px;margin-bottom:${Math.round(pad*.38)}px}
        .hl{font-size:${hlSize}px;font-weight:900;color:${fg};line-height:.92;letter-spacing:-.03em;text-transform:uppercase}
        .divider{width:60%;height:2px;background:${fg};opacity:.25;margin:${Math.round(pad*.38)}px auto}
        .sub{font-size:${subSz}px;color:${fg};opacity:.55;font-style:italic;line-height:1.45}
        .bd{font-size:${bdSz}px;color:${fg};opacity:.45;margin-top:${Math.round(pad*.28)}px;line-height:1.55}
        .auth{margin-top:auto;font-size:${authSz}px;font-weight:700;color:${accent};letter-spacing:.1em;text-transform:uppercase}`,
      html: `<div class="ob"></div><div class="ib"></div>
        ${subheadline ? `<span class="badge">${esc(subheadline)}</span>` : ''}
        ${headline    ? `<h1 class="hl">${esc(headline)}</h1>` : ''}
        <div class="divider"></div>
        ${body        ? `<p class="bd">${esc(body)}</p>` : ''}
        ${author      ? `<p class="auth">${esc(author)}</p>` : ''}`,
    },
    neon: {
      css: `
        .p{background:${bg};padding:${pad}px;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:center;height:${h}px}
        .hl{font-size:${hlSize}px;font-weight:900;color:${fg};line-height:1;letter-spacing:-.02em;text-shadow:0 0 20px ${accent},0 0 60px ${accent}44}
        .nrule{width:120px;height:2px;background:${accent};box-shadow:0 0 8px ${accent},0 0 18px ${accent};margin:${Math.round(pad*.38)}px auto}
        .sub{font-size:${subSz}px;color:${fg};opacity:.7;line-height:1.45}
        .bd{font-size:${bdSz}px;color:${fg};opacity:.42;margin-top:${Math.round(pad*.3)}px;line-height:1.6}
        .auth{font-size:${authSz}px;font-weight:700;color:${accent};letter-spacing:.14em;text-transform:uppercase;margin-top:${Math.round(pad*.55)}px;text-shadow:0 0 8px ${accent}88}`,
      html: `${headline    ? `<h1 class="hl">${esc(headline)}</h1>` : ''}
        <div class="nrule"></div>
        ${subheadline ? `<p class="sub">${esc(subheadline)}</p>` : ''}
        ${body        ? `<p class="bd">${esc(body)}</p>` : ''}
        ${author      ? `<div class="auth">${esc(author)}</div>` : ''}`,
    },
  };

  const t = templates[style] || templates.editorial;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif}
.p{width:${w}px;height:${h}px;overflow:hidden;position:relative}
${t.css}
</style></head><body>
<div class="p">${t.html}</div>
</body></html>`;
}

// ── Tool: create_social_card ─────────────────────────────────────────────────

export const createSocialCardTool = {
  name: 'create_social_card',
  description:
    'Generate a pixel-perfect PNG image for social media posts using Puppeteer. Supports Instagram (1:1, 4:5), Stories/Reels (9:16), Twitter/X, LinkedIn, Open Graph, YouTube thumbnails, and Facebook. ' +
    'Five visual styles: clean (minimal white), bold (high-contrast dark), gradient (color wash), dark (dark bg + accent ring), glass (frosted glass panel). ' +
    'Optionally embed a background image. Returns a PNG artifact ready to upload.',
  category: 'design',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      headline:     { type: 'string', description: 'Primary headline text (large, bold).' },
      subheadline:  { type: 'string', description: 'Smaller sub-headline or tagline.' },
      body:         { type: 'string', description: 'Supporting body copy (kept short for cards).' },
      platform: {
        type: 'string',
        enum: ['instagram-square', 'instagram-portrait', 'story', 'twitter', 'linkedin', 'og-image', 'youtube-thumb', 'facebook'],
        description: 'Target platform — controls the output pixel dimensions.',
      },
      style: {
        type: 'string',
        enum: ['clean', 'bold', 'gradient', 'dark', 'glass'],
        description: 'Visual style. "clean": white minimal. "bold": dark oversized type. "gradient": color wash. "dark": dark bg with accent ring. "glass": frosted panel.',
      },
      bg_color:     { type: 'string', description: 'Background CSS color (e.g. "#1a1a2e" or "hsl(240,80%,12%)").' },
      text_color:   { type: 'string', description: 'Text color (defaults to contrast pair for bg).' },
      accent_color: { type: 'string', description: 'Brand accent color for lines, dots, gradients.' },
      logo_text:    { type: 'string', description: 'Brand name or @handle shown small at the bottom.' },
      bg_image_path: { type: 'string', description: 'Optional path to a background image (relative to working dir). Embedded as base64 — works offline.' },
      filename:     { type: 'string', description: 'Output filename. Should end in .png.' },
    },
    required: ['headline', 'platform'],
  },
  execute: async (args, context) => {
    try {
      const size = PLATFORM_SIZES[args.platform] || PLATFORM_SIZES['instagram-square'];
      const { w, h } = size;

      let bgImageBase64 = null;
      if (args.bg_image_path) {
        const imgAbs = safePath(args.bg_image_path, context.workingDir);
        bgImageBase64 = imageToBase64(imgAbs);
      }

      const html = buildSocialCardHtml({
        w, h,
        headline:     args.headline,
        subheadline:  args.subheadline,
        body:         args.body,
        bgColor:      args.bg_color,
        textColor:    args.text_color,
        accentColor:  args.accent_color,
        logoText:     args.logo_text,
        style:        args.style || 'clean',
        bgImageBase64,
      });

      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const id = randomUUID().slice(0, 10);
      const base = slugify(args.filename ? path.parse(args.filename).name : args.headline);
      const filename = `${base}_${args.platform}_${id}.png`;
      const filePath = path.join(artifactsDir, filename);

      await screenshotHtmlToPng(html, filePath, { width: w, height: h });

      const stat = fs.statSync(filePath);
      const relPath = path.relative(context.workingDir, filePath);

      return {
        success: true,
        artifact: {
          id,
          title: args.headline,
          filename,
          path: relPath,
          absolutePath: filePath,
          type: 'image',
          size: stat.size,
          createdAt: new Date().toISOString(),
          platform: args.platform,
          dimensions: `${w}×${h}`,
          style: args.style || 'clean',
        },
        dimensions: `${w}×${h}`,
        platform: size.label,
        message: `Social card "${args.headline}" → ${filename} (${w}×${h}px, ${formatSize(stat.size)})`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── Tool: create_infographic ─────────────────────────────────────────────────

export const createInfographicTool = {
  name: 'create_infographic',
  description:
    'Turn structured data into a beautiful infographic PNG (via Puppeteer screenshot of HTML/SVG). ' +
    'Types: "stats" (big numbers in a grid), "timeline" (chronological events), "comparison" (horizontal bar chart), ' +
    '"list" (numbered/icon list), "flow" (process steps with arrows). ' +
    'Color schemes: blue, purple, green, orange, red, dark. ' +
    'Also saves an interactive HTML version. Returns both artifacts.',
  category: 'design',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      title:    { type: 'string', description: 'Infographic title shown at the top.' },
      subtitle: { type: 'string', description: 'Optional subtitle under the title.' },
      type: {
        type: 'string',
        enum: ['stats', 'timeline', 'comparison', 'list', 'flow'],
        description: '"stats": big KPI numbers. "timeline": date → event. "comparison": bar chart. "list": numbered steps. "flow": process arrows.',
      },
      data: {
        type: 'array',
        description:
          'Array of data objects. ' +
          'stats: [{label, value, color?, change?}]. ' +
          'timeline: [{date, title, description?}]. ' +
          'comparison: [{label, value, color?}]. ' +
          'list: [{title, description?, icon?}]. ' +
          'flow: [{label, description?, icon?}].',
        items: { type: 'object' },
      },
      color_scheme: {
        type: 'string',
        enum: ['blue', 'purple', 'green', 'orange', 'red', 'dark'],
        description: 'Color palette (default: blue).',
      },
      width:  { type: 'number', description: 'Output width in pixels (default: 1200).' },
      height: { type: 'number', description: 'Output height in pixels (default: 675). Increase for tall content.' },
      filename: { type: 'string', description: 'Base filename (without extension).' },
    },
    required: ['title', 'type', 'data'],
  },
  execute: async (args, context) => {
    try {
      const w = Math.round(Number(args.width)  || 1200);
      const h = Math.round(Number(args.height) || 675);

      const html = buildInfographicHtml({
        w, h,
        title:       args.title,
        subtitle:    args.subtitle,
        type:        args.type,
        data:        args.data,
        colorScheme: args.color_scheme || 'blue',
      });

      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const id = randomUUID().slice(0, 10);
      const base = slugify(args.filename || args.title);

      // Save HTML version (interactive)
      const htmlFilename = `${base}_infographic_${id}.html`;
      const htmlPath = path.join(artifactsDir, htmlFilename);
      fs.writeFileSync(htmlPath, html, 'utf8');

      // Screenshot to PNG
      const pngFilename = `${base}_infographic_${id}.png`;
      const pngPath = path.join(artifactsDir, pngFilename);
      await screenshotHtmlToPng(html, pngPath, { width: w, height: h });

      const pngStat  = fs.statSync(pngPath);
      const htmlStat = fs.statSync(htmlPath);
      const relPng   = path.relative(context.workingDir, pngPath);
      const relHtml  = path.relative(context.workingDir, htmlPath);

      return {
        success: true,
        artifact: {
          id,
          title: args.title,
          filename: pngFilename,
          path: relPng,
          absolutePath: pngPath,
          type: 'image',
          size: pngStat.size,
          createdAt: new Date().toISOString(),
          infographicType: args.type,
          colorScheme: args.color_scheme || 'blue',
        },
        relatedArtifacts: [{
          title: `${args.title} (interactive)`,
          filename: htmlFilename,
          path: relHtml,
          absolutePath: htmlPath,
          type: 'html',
          size: htmlStat.size,
          createdAt: new Date().toISOString(),
        }],
        message: `Infographic "${args.title}" → ${pngFilename} (${w}×${h}px, ${formatSize(pngStat.size)})`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── Tool: create_carousel ────────────────────────────────────────────────────

export const createCarouselTool = {
  name: 'create_carousel',
  description:
    'Create an Instagram or LinkedIn carousel as a ZIP of numbered PNG slides. ' +
    'Each slide is screenshotted via Puppeteer. Slides can have unique colors, content, and optional background images. ' +
    'Returns a ZIP artifact with all slides + individual PNG artifacts for each slide.',
  category: 'design',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Carousel title (used for filenames).' },
      platform: {
        type: 'string',
        enum: ['instagram-square', 'instagram-portrait', 'linkedin'],
        description: 'Platform (controls dimensions). Default: instagram-square.',
      },
      slides: {
        type: 'array',
        description: 'Ordered list of slides (max 10).',
        items: {
          type: 'object',
          properties: {
            title:        { type: 'string' },
            subheadline:  { type: 'string' },
            body:         { type: 'string' },
            bg_color:     { type: 'string' },
            text_color:   { type: 'string' },
            accent_color: { type: 'string' },
            style:        { type: 'string', enum: ['clean', 'bold', 'gradient', 'dark', 'glass'] },
            bg_image_path: { type: 'string' },
          },
        },
      },
      logo_text:    { type: 'string', description: 'Brand @handle shown on every slide.' },
      accent_color: { type: 'string', description: 'Default accent color for all slides.' },
      filename:     { type: 'string', description: 'Output ZIP filename.' },
    },
    required: ['title', 'slides'],
  },
  execute: async (args, context) => {
    try {
      const slides = (Array.isArray(args.slides) ? args.slides : []).slice(0, 10);
      if (slides.length === 0) return { success: false, error: 'At least one slide is required.' };

      const platform = args.platform || 'instagram-square';
      const size = PLATFORM_SIZES[platform] || PLATFORM_SIZES['instagram-square'];
      const { w, h } = size;

      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const id = randomUUID().slice(0, 10);
      const baseSlug = slugify(args.title);

      // Default style cycle for visual variety
      const styleRotation = ['bold', 'clean', 'gradient', 'dark', 'clean', 'bold', 'glass', 'clean', 'gradient', 'dark'];

      const zip = new JSZip();
      const pngArtifacts = [];

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        let bgImageBase64 = null;
        if (slide.bg_image_path) {
          bgImageBase64 = imageToBase64(safePath(slide.bg_image_path, context.workingDir));
        }

        const html = buildSocialCardHtml({
          w, h,
          headline:    slide.title,
          subheadline: slide.subheadline,
          body:        slide.body,
          bgColor:     slide.bg_color,
          textColor:   slide.text_color,
          accentColor: slide.accent_color || args.accent_color,
          logoText:    args.logo_text ? `${args.logo_text}  ${i+1}/${slides.length}` : `${i+1}/${slides.length}`,
          style:       slide.style || styleRotation[i % styleRotation.length],
          bgImageBase64,
        });

        const slideNum = String(i + 1).padStart(2, '0');
        const slideFilename = `${baseSlug}_slide${slideNum}_${id}.png`;
        const slidePath = path.join(artifactsDir, slideFilename);

        await screenshotHtmlToPng(html, slidePath, { width: w, height: h });

        const stat = fs.statSync(slidePath);
        const pngBuf = fs.readFileSync(slidePath);
        zip.file(`slide${slideNum}.png`, pngBuf);

        pngArtifacts.push({
          title: slide.title || `Slide ${i + 1}`,
          filename: slideFilename,
          path: path.relative(context.workingDir, slidePath),
          absolutePath: slidePath,
          type: 'image',
          size: stat.size,
          createdAt: new Date().toISOString(),
        });
      }

      // Write ZIP
      const zipBase = slugify(args.filename ? path.parse(args.filename).name : `${args.title}-carousel`);
      const zipFilename = `${zipBase}_${id}.zip`;
      const zipPath = path.join(artifactsDir, zipFilename);
      const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      fs.writeFileSync(zipPath, zipBuf);

      const zipStat = fs.statSync(zipPath);
      const relZip = path.relative(context.workingDir, zipPath);

      return {
        success: true,
        artifact: {
          id,
          title: `${args.title} — Carousel`,
          filename: zipFilename,
          path: relZip,
          absolutePath: zipPath,
          type: 'zip',
          size: zipStat.size,
          createdAt: new Date().toISOString(),
        },
        slides: pngArtifacts,
        slideCount: slides.length,
        platform: size.label,
        message: `Carousel "${args.title}" → ${zipFilename} (${slides.length} slides, ${formatSize(zipStat.size)})`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── Tool: create_typographic_poster ─────────────────────────────────────────

export const createTypographicPosterTool = {
  name: 'create_typographic_poster',
  description:
    'Generate a typographic poster PNG — text-dominant visuals for quotes, announcements, event promos, and brand statements. ' +
    'Styles: "editorial" (NYT-style serif rules), "swiss" (modernist grid), "bold" (oversized maximalist), "retro" (warm bordered), "neon" (dark glow). ' +
    'Sizes: a4, letter, square, story, banner, custom.',
  category: 'design',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      headline:     { type: 'string', description: 'Main poster headline (required — make it impactful).' },
      subheadline:  { type: 'string', description: 'Subheading, event name, or badge text.' },
      body:         { type: 'string', description: 'Body copy — kept concise for readability.' },
      author:       { type: 'string', description: 'Attribution, brand name, or date.' },
      style: {
        type: 'string',
        enum: ['editorial', 'swiss', 'bold', 'retro', 'neon'],
        description: 'Visual style.',
      },
      size: {
        type: 'string',
        enum: ['a4', 'letter', 'square', 'story', 'banner', 'custom'],
        description: '"a4": 794×1123px. "letter": 816×1056px. "square": 1080×1080px. "story": 1080×1920px. "banner": 1200×400px.',
      },
      width:        { type: 'number', description: 'Custom width in pixels (when size="custom").' },
      height:       { type: 'number', description: 'Custom height in pixels (when size="custom").' },
      bg_color:     { type: 'string', description: 'Background color.' },
      text_color:   { type: 'string', description: 'Text color.' },
      accent_color: { type: 'string', description: 'Accent / brand color.' },
      filename:     { type: 'string', description: 'Output filename ending in .png.' },
    },
    required: ['headline'],
  },
  execute: async (args, context) => {
    try {
      const sizeMap = {
        a4:     { w: 794,  h: 1123 },
        letter: { w: 816,  h: 1056 },
        square: { w: 1080, h: 1080 },
        story:  { w: 1080, h: 1920 },
        banner: { w: 1200, h: 400  },
      };
      const preset = sizeMap[args.size] || sizeMap.a4;
      const w = args.size === 'custom' ? (Math.round(Number(args.width) || 794)) : preset.w;
      const h = args.size === 'custom' ? (Math.round(Number(args.height) || 1123)) : preset.h;

      const html = buildTypographicPosterHtml({
        w, h,
        headline:    args.headline,
        subheadline: args.subheadline,
        body:        args.body,
        author:      args.author,
        bgColor:     args.bg_color,
        textColor:   args.text_color,
        accentColor: args.accent_color,
        style:       args.style || 'editorial',
      });

      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const id = randomUUID().slice(0, 10);
      const base = slugify(args.filename ? path.parse(args.filename).name : args.headline);
      const filename = `${base}_poster_${id}.png`;
      const filePath = path.join(artifactsDir, filename);

      await screenshotHtmlToPng(html, filePath, { width: w, height: h });

      const stat = fs.statSync(filePath);
      const relPath = path.relative(context.workingDir, filePath);

      return {
        success: true,
        artifact: {
          id,
          title: args.headline,
          filename,
          path: relPath,
          absolutePath: filePath,
          type: 'image',
          size: stat.size,
          createdAt: new Date().toISOString(),
          style: args.style || 'editorial',
          dimensions: `${w}×${h}`,
        },
        dimensions: `${w}×${h}`,
        message: `Typographic poster "${args.headline}" → ${filename} (${w}×${h}px, ${formatSize(stat.size)})`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── Tool: compose_image ──────────────────────────────────────────────────────
// Uses node-canvas (Cairo-backed, cross-platform) — already in package.json.

export const composeImageTool = {
  name: 'compose_image',
  description:
    'Compose a PNG image using node-canvas (cross-platform, no Puppeteer needed). ' +
    'Layer a base image, shape fills, additional image overlays, and text overlays in any order. ' +
    'Great for: adding text to generated images, creating branded overlays, watermarking, resizing, cropping, or building composite visuals from multiple images. ' +
    'Uses the Cairo graphics library via the "canvas" npm package (already installed).',
  category: 'design',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      output_filename: { type: 'string', description: 'Output PNG filename.' },
      width:  { type: 'number', description: 'Canvas width in pixels. Defaults to base image width or 1200.' },
      height: { type: 'number', description: 'Canvas height in pixels. Defaults to base image height or 675.' },
      bg_color: { type: 'string', description: 'Canvas background fill color before any layers (e.g. "#ffffff").' },
      base_image: { type: 'string', description: 'Path to background/base image (relative to working dir). Stretched to fill canvas.' },
      layers: {
        type: 'array',
        description: 'Ordered list of layers drawn top-to-bottom. Each layer is one of: shape, image, or text.',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['shape', 'image', 'text'],
              description: '"shape": filled rect or circle. "image": overlay an image file. "text": render text.',
            },
            // shape
            shape_type: { type: 'string', enum: ['rect', 'circle', 'rounded-rect'], description: 'Shape geometry.' },
            // image + shape + text
            x:       { type: 'number' }, y:      { type: 'number' },
            width:   { type: 'number' }, height: { type: 'number' },
            color:   { type: 'string', description: 'Fill color (shapes) or text color.' },
            opacity: { type: 'number', description: 'Layer opacity 0–1 (default: 1).' },
            radius:  { type: 'number', description: 'Border radius in pixels for rounded-rect.' },
            // image only
            image_path: { type: 'string', description: 'Path to image file (relative to working dir).' },
            fit: {
              type: 'string',
              enum: ['fill', 'contain', 'cover'],
              description: 'How to fit the image into its bounds (default: fill).',
            },
            // text only
            text:        { type: 'string', description: 'Text content (use \\n for newlines).' },
            font_size:   { type: 'number', description: 'Font size in pixels (default: 32).' },
            font_weight: { type: 'string', enum: ['normal', 'bold', '100','200','300','400','500','600','700','800','900'], description: 'Font weight.' },
            font_style:  { type: 'string', enum: ['normal', 'italic'], description: 'Font style.' },
            text_align:  { type: 'string', enum: ['left', 'center', 'right'], description: 'Text alignment.' },
            max_width:   { type: 'number', description: 'Max text width in pixels — enables word wrapping.' },
            line_height: { type: 'number', description: 'Line height multiplier (default: 1.3).' },
            shadow_color:  { type: 'string', description: 'Text shadow color.' },
            shadow_blur:   { type: 'number', description: 'Text shadow blur radius.' },
            shadow_offset_x: { type: 'number' },
            shadow_offset_y: { type: 'number' },
          },
          required: ['type'],
        },
      },
    },
    required: [],
  },
  execute: async (args, context) => {
    let canvasLib;
    try {
      canvasLib = await import('canvas');
    } catch {
      return {
        success: false,
        error: 'The "canvas" npm package is not available. Run "npm install canvas" in the den directory.',
      };
    }
    const { createCanvas, loadImage } = canvasLib;

    try {
      // Determine dimensions
      let baseImg = null;
      if (args.base_image) {
        const imgAbs = safePath(args.base_image, context.workingDir);
        if (fs.existsSync(imgAbs)) baseImg = await loadImage(imgAbs);
      }
      const w = Math.round(Number(args.width)  || baseImg?.width  || 1200);
      const h = Math.round(Number(args.height) || baseImg?.height || 675);

      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');

      // Background
      if (args.bg_color) {
        ctx.fillStyle = args.bg_color;
        ctx.fillRect(0, 0, w, h);
      }

      // Base image
      if (baseImg) ctx.drawImage(baseImg, 0, 0, w, h);

      // Layers
      const layers = Array.isArray(args.layers) ? args.layers : [];
      for (const layer of layers) {
        ctx.save();
        ctx.globalAlpha = Number(layer.opacity ?? 1);

        if (layer.type === 'shape') {
          ctx.fillStyle = layer.color || '#000000';
          const lx = layer.x || 0, ly = layer.y || 0, lw = layer.width || w, lh = layer.height || h;
          if (layer.shape_type === 'circle') {
            ctx.beginPath();
            ctx.arc(lx + lw / 2, ly + lh / 2, Math.min(lw, lh) / 2, 0, Math.PI * 2);
            ctx.fill();
          } else if (layer.shape_type === 'rounded-rect' && layer.radius) {
            const r = layer.radius;
            ctx.beginPath();
            ctx.moveTo(lx + r, ly);
            ctx.lineTo(lx + lw - r, ly);
            ctx.quadraticCurveTo(lx + lw, ly, lx + lw, ly + r);
            ctx.lineTo(lx + lw, ly + lh - r);
            ctx.quadraticCurveTo(lx + lw, ly + lh, lx + lw - r, ly + lh);
            ctx.lineTo(lx + r, ly + lh);
            ctx.quadraticCurveTo(lx, ly + lh, lx, ly + lh - r);
            ctx.lineTo(lx, ly + r);
            ctx.quadraticCurveTo(lx, ly, lx + r, ly);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(lx, ly, lw, lh);
          }
        } else if (layer.type === 'image' && layer.image_path) {
          const imgAbs = safePath(layer.image_path, context.workingDir);
          if (fs.existsSync(imgAbs)) {
            const img = await loadImage(imgAbs);
            const lx = layer.x || 0, ly = layer.y || 0;
            const lw = layer.width  || img.width;
            const lh = layer.height || img.height;

            if (layer.fit === 'contain') {
              const scale = Math.min(lw / img.width, lh / img.height);
              const sw = img.width * scale, sh = img.height * scale;
              ctx.drawImage(img, lx + (lw - sw) / 2, ly + (lh - sh) / 2, sw, sh);
            } else if (layer.fit === 'cover') {
              const scale = Math.max(lw / img.width, lh / img.height);
              const sw = img.width * scale, sh = img.height * scale;
              ctx.drawImage(img, lx + (lw - sw) / 2, ly + (lh - sh) / 2, sw, sh);
            } else {
              ctx.drawImage(img, lx, ly, lw, lh);
            }
          }
        } else if (layer.type === 'text' && layer.text) {
          const fontSize   = Number(layer.font_size   || 32);
          const fontWeight = layer.font_weight || 'normal';
          const fontStyle  = layer.font_style  || 'normal';
          ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
          ctx.fillStyle   = layer.color || '#ffffff';
          ctx.textAlign   = (layer.text_align || 'left');
          ctx.textBaseline = 'top';

          if (layer.shadow_color) {
            ctx.shadowColor   = layer.shadow_color;
            ctx.shadowBlur    = Number(layer.shadow_blur    || 8);
            ctx.shadowOffsetX = Number(layer.shadow_offset_x || 0);
            ctx.shadowOffsetY = Number(layer.shadow_offset_y || 0);
          }

          const lh = Number(layer.line_height || 1.3) * fontSize;
          const maxW = Number(layer.max_width || 0);
          const lines = [];

          // Word-wrap
          for (const rawLine of String(layer.text).split('\n')) {
            if (!maxW) { lines.push(rawLine); continue; }
            const words = rawLine.split(' ');
            let cur = '';
            for (const word of words) {
              const test = cur ? `${cur} ${word}` : word;
              if (ctx.measureText(test).width > maxW && cur) {
                lines.push(cur);
                cur = word;
              } else {
                cur = test;
              }
            }
            if (cur) lines.push(cur);
          }

          let textX = layer.x || 0;
          if (ctx.textAlign === 'center') textX = (layer.x || 0) + (maxW || w) / 2;
          else if (ctx.textAlign === 'right') textX = (layer.x || 0) + (maxW || w);

          lines.forEach((line, i) => ctx.fillText(line, textX, (layer.y || 0) + i * lh));
        }

        ctx.restore();
      }

      // Save output
      const artifactsDir = ensureArtifactsDir(context.workingDir);
      const id = randomUUID().slice(0, 10);
      const base = slugify(args.output_filename ? path.parse(args.output_filename).name : 'composed');
      const filename = `${base}_${id}.png`;
      const filePath = path.join(artifactsDir, filename);
      const pngBuf = canvas.toBuffer('image/png');
      fs.writeFileSync(filePath, pngBuf);

      const stat = fs.statSync(filePath);
      const relPath = path.relative(context.workingDir, filePath);

      return {
        success: true,
        artifact: {
          id,
          title: args.output_filename || 'Composed Image',
          filename,
          path: relPath,
          absolutePath: filePath,
          type: 'image',
          size: stat.size,
          createdAt: new Date().toISOString(),
          dimensions: `${w}×${h}`,
          layers: layers.length,
        },
        dimensions: `${w}×${h}`,
        message: `Image composed → ${filename} (${w}×${h}px, ${layers.length} layers, ${formatSize(stat.size)})`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── Export ───────────────────────────────────────────────────────────────────

export const socialTools = [
  createSocialCardTool,
  createInfographicTool,
  createCarouselTool,
  createTypographicPosterTool,
  composeImageTool,
];

export default socialTools;
