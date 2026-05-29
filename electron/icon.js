// electron/icon.js — Runtime app-icon customization (dock / window / tray)
//
// Lets users pick a bundled preset or upload their own image. The choice is
// persisted to userData so it survives relaunches. NOTE: this changes the
// *running* icons (macOS Dock, window, tray). The Finder .app / Windows .exe
// bundle icon is baked at build time and cannot be changed here.
//
import { app, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import { ICONS, NEKO_ASSETS, USER_DATA, IS_MAC } from './constants.js';
import { getMainWindow } from './window.js';
import { setTrayImage } from './tray.js';

const CONFIG_PATH = path.join(USER_DATA, 'app-icon.json');
const CUSTOM_PATH = path.join(USER_DATA, 'custom-app-icon.png');

/** Bundled preset icons (key → filename under NEKO_ASSETS). */
export const ICON_PRESETS = [
  { key: 'default', name: 'Asyncat', file: 'app-icon-512.png' },
];

const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * Center-crop to a square and mask the corners into a rounded "squircle" so a
 * raw rectangular upload matches the shape of the bundled icons (instead of
 * showing as a hard square in the Dock/tray).
 */
function roundedSquareIcon(img) {
  const { width, height } = img.getSize();
  if (!width || !height) return img;

  const side = Math.min(width, height);
  const square = width === height
    ? img
    : img.crop({
        x: Math.floor((width - side) / 2),
        y: Math.floor((height - side) / 2),
        width: side,
        height: side,
      });

  const bmp = square.toBitmap(); // BGRA, side*side*4
  const r = side * 0.225;        // macOS-style corner radius

  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      // Clamp into the inner rect; corners measure distance to the arc center.
      const cx = x < r ? r : (x > side - r ? side - r : x);
      const cy = y < r ? r : (y > side - r ? side - r : y);
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > r) {
        const idx = (y * side + x) * 4;
        const edge = dist - r; // soft 1px edge for anti-aliasing
        bmp[idx + 3] = edge >= 1 ? 0 : Math.round(bmp[idx + 3] * (1 - edge));
      }
    }
  }

  return nativeImage.createFromBitmap(bmp, { width: side, height: side });
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { type: 'default' };
  }
}

function writeConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch { /* best effort */ }
}

function presetPath(key) {
  const preset = ICON_PRESETS.find(p => p.key === key);
  return preset ? path.join(NEKO_ASSETS, preset.file) : ICONS.png;
}

/** Resolve the active icon source path from the saved config. */
function resolveIconPath(cfg = readConfig()) {
  if (cfg.type === 'custom' && fs.existsSync(CUSTOM_PATH)) return CUSTOM_PATH;
  if (cfg.type === 'preset') return presetPath(cfg.key);
  return ICONS.png;
}

/** Apply the configured icon to the Dock (mac), the window, and the tray. */
export function applyAppIcon(cfg = readConfig()) {
  const img = nativeImage.createFromPath(resolveIconPath(cfg));
  if (img.isEmpty()) return;

  if (IS_MAC && app.dock) app.dock.setIcon(img);

  // Window icon — shown on Windows/Linux; a no-op on macOS.
  const win = getMainWindow();
  if (win && !IS_MAC) win.setIcon(img);

  // Tray wants a small variant on macOS to match the menu bar.
  setTrayImage(IS_MAC ? img.resize({ width: 18, height: 18 }) : img);
}

/** Return the current selection (+ a data-URL preview for custom icons). */
export function getAppIcon() {
  const cfg = readConfig();
  let dataUrl = null;
  if (cfg.type === 'custom' && fs.existsSync(CUSTOM_PATH)) {
    try { dataUrl = nativeImage.createFromPath(CUSTOM_PATH).toDataURL(); } catch { /* ignore */ }
  }
  return { type: cfg.type || 'default', key: cfg.key || null, dataUrl };
}

/**
 * Persist and apply a new icon.
 * @param {{ type: 'preset'|'custom', key?: string, path?: string }} payload
 */
export function setAppIcon(payload = {}) {
  if (payload.type === 'preset') {
    if (!ICON_PRESETS.some(p => p.key === payload.key)) {
      return { success: false, error: 'Unknown preset icon.' };
    }
    writeConfig({ type: 'preset', key: payload.key });
  } else if (payload.type === 'custom') {
    const src = payload.path;
    if (!src || !fs.existsSync(src)) return { success: false, error: 'Image file not found.' };
    if (!ALLOWED_EXT.includes(path.extname(src).toLowerCase())) {
      return { success: false, error: 'Use a PNG, JPG, or WebP image.' };
    }
    const img = nativeImage.createFromPath(src);
    if (img.isEmpty()) return { success: false, error: 'Could not read that image.' };
    // Crop to a rounded square and store as PNG in userData so the icon matches
    // the bundled shape and survives the original being moved.
    try { fs.writeFileSync(CUSTOM_PATH, roundedSquareIcon(img).toPNG()); }
    catch { return { success: false, error: 'Failed to save icon.' }; }
    writeConfig({ type: 'custom' });
  } else {
    return { success: false, error: 'Invalid icon type.' };
  }
  applyAppIcon();
  return { success: true, ...getAppIcon() };
}

/** Revert to the built-in default icon and delete any custom upload. */
export function resetAppIcon() {
  writeConfig({ type: 'default' });
  try { if (fs.existsSync(CUSTOM_PATH)) fs.unlinkSync(CUSTOM_PATH); } catch { /* ignore */ }
  applyAppIcon();
  return { success: true, type: 'default', key: null, dataUrl: null };
}
