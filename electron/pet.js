// electron/pet.js — Persistent on-screen companion ("pet") overlay.
//
// A small frameless/transparent always-on-top window that floats in a corner
// of the screen and stays visible across window switches and spaces. It shows
// a status bubble driven by the active agent-run count (see main.js app:badge),
// mirroring the Codex "pet" idea. Users can pick the default sprite or upload
// their own image / animated GIF.
//
import { BrowserWindow, screen } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NEKO_ASSETS, USER_DATA, IS_MAC } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PET_HTML    = path.join(__dirname, 'pet.html');
const PET_PRELOAD = path.join(__dirname, 'pet-preload.js');
const CONFIG_PATH = path.join(USER_DATA, 'pet.json');

const W = 140;
const H = 170;

const DEFAULT_SPRITE = path.join(NEKO_ASSETS, 'app-icon-512.png');
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

let pet = null;
let lastStatus = 'idle';
let displayTimer = null;
let isAutoMoving = false; // suppress position persistence during programmatic moves

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return { enabled: false, sprite: 'default' }; }
}

function writeConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch { /* best effort */ }
}

function spritePath(cfg = readConfig()) {
  if (cfg.sprite === 'custom' && cfg.customPath && fs.existsSync(cfg.customPath)) return cfg.customPath;
  return DEFAULT_SPRITE;
}

/** Read the sprite as a data URL (raw, so animated GIFs keep animating). */
function spriteDataUrl(cfg = readConfig()) {
  const p = spritePath(cfg);
  try {
    const ext = path.extname(p).toLowerCase();
    const mime = ext === '.gif' ? 'image/gif'
      : ext === '.webp' ? 'image/webp'
      : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
      : 'image/png';
    return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
  } catch { return null; }
}

function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + workArea.width - W - 24),
    y: Math.round(workArea.y + workArea.height - H - 24),
  };
}

/** The display the pet currently sits on. */
function petDisplay() {
  if (!pet || pet.isDestroyed()) return null;
  const [x, y] = pet.getPosition();
  return screen.getDisplayNearestPoint({ x: Math.round(x + W / 2), y: Math.round(y + H / 2) });
}

/** Clamp the pet fully inside a display's work area. */
function clampToDisplay(display) {
  if (!pet || pet.isDestroyed() || !display) return;
  const { workArea: a } = display;
  const [x, y] = pet.getPosition();
  const nx = Math.min(Math.max(x, a.x), a.x + a.width - W);
  const ny = Math.min(Math.max(y, a.y), a.y + a.height - H);
  if (nx !== x || ny !== y) {
    isAutoMoving = true;
    pet.setPosition(nx, ny, false);
    isAutoMoving = false;
  }
}

/**
 * Keep the pet on whichever display the user is currently on. The cursor is the
 * best cross-application signal for "where the user is" — when it crosses to
 * another monitor, move the pet there, preserving its relative corner offset.
 */
function followActiveDisplay() {
  if (!pet || pet.isDestroyed()) return;
  if (screen.getAllDisplays().length < 2) return;

  const active = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const from = petDisplay();
  if (!active || !from || active.id === from.id) return;

  const a = from.workArea;
  const b = active.workArea;
  const [px, py] = pet.getPosition();
  const relX = (px - a.x) / Math.max(1, a.width - W);
  const relY = (py - a.y) / Math.max(1, a.height - H);

  const nx = Math.min(Math.max(Math.round(b.x + relX * (b.width - W)), b.x), b.x + b.width - W);
  const ny = Math.min(Math.max(Math.round(b.y + relY * (b.height - H)), b.y), b.y + b.height - H);

  isAutoMoving = true;
  pet.setPosition(nx, ny, false);
  isAutoMoving = false;
}

function handleDisplayRemoved() {
  clampToDisplay(petDisplay() || screen.getPrimaryDisplay());
}

function startDisplayWatcher() {
  stopDisplayWatcher();
  // Cheap cursor-point poll; only acts when the active display actually changes.
  displayTimer = setInterval(followActiveDisplay, 1000);
  screen.on('display-removed', handleDisplayRemoved);
  screen.on('display-metrics-changed', handleDisplayRemoved);
}

function stopDisplayWatcher() {
  if (displayTimer) { clearInterval(displayTimer); displayTimer = null; }
  screen.removeListener('display-removed', handleDisplayRemoved);
  screen.removeListener('display-metrics-changed', handleDisplayRemoved);
}

/** (Re)assert that the pet floats above everything and rides along every Space. */
function pinAcrossSpaces() {
  if (!pet || pet.isDestroyed()) return;
  pet.setAlwaysOnTop(true, 'screen-saver');
  if (pet.setVisibleOnAllWorkspaces) {
    // skipTransformProcessType avoids Electron flipping the app's process type
    // (which resets the collection behavior and dock state) on this call.
    pet.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
  }
}

function sendInit() {
  if (!pet || pet.isDestroyed()) return;
  pet.webContents.send('pet:init', { sprite: spriteDataUrl(), status: lastStatus });
}

export function createPetWindow() {
  if (pet && !pet.isDestroyed()) return pet;

  const cfg = readConfig();
  const pos = Number.isFinite(cfg.x) && Number.isFinite(cfg.y)
    ? { x: cfg.x, y: cfg.y }
    : defaultPosition();

  pet = new BrowserWindow({
    width:  W,
    height: H,
    x: pos.x,
    y: pos.y,
    frame:           false,
    transparent:     true,
    backgroundColor: '#00000000',
    resizable:       false,
    movable:         true,
    minimizable:     false,
    maximizable:     false,
    fullscreenable:  false,
    alwaysOnTop:     true,
    skipTaskbar:     true,
    focusable:       false,
    hasShadow:       false,
    show:            false,
    // macOS: an NSPanel reliably floats across every Space and over fullscreen
    // apps — a normal window often stays pinned to the Space it was created on.
    ...(IS_MAC && { type: 'panel' }),
    webPreferences: {
      preload:          PET_PRELOAD,
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
    },
  });

  // Float above everything and ride along every Space / fullscreen app.
  pinAcrossSpaces();

  pet.loadFile(PET_HTML);
  pet.once('ready-to-show', () => {
    sendInit();
    pinAcrossSpaces();          // reassert after load (macOS can reset it)
    pet.showInactive();
    pinAcrossSpaces();          // and again once it's actually on screen
    startDisplayWatcher();      // follow the user across monitors
  });

  // Persist the position only when the *user* drags the pet (not auto-moves).
  pet.on('moved', () => {
    if (!pet || pet.isDestroyed() || isAutoMoving) return;
    const [x, y] = pet.getPosition();
    writeConfig({ ...readConfig(), x, y });
  });

  pet.on('closed', () => { pet = null; });
  return pet;
}

export function destroyPetWindow() {
  stopDisplayWatcher();
  if (pet && !pet.isDestroyed()) pet.close();
  pet = null;
}

/** Push a status to the pet bubble: 'idle' | 'working' | 'done' | 'needs-approval'. */
export function setPetStatus(status) {
  lastStatus = status;
  if (pet && !pet.isDestroyed()) pet.webContents.send('pet:status', status);
}

/** Create the pet window on boot if it was enabled. */
export function initPet() {
  if (readConfig().enabled) createPetWindow();
}

export function getPet() {
  const cfg = readConfig();
  return {
    enabled: !!cfg.enabled,
    sprite:  cfg.sprite || 'default',
    dataUrl: cfg.sprite === 'custom' ? spriteDataUrl(cfg) : null,
  };
}

/**
 * Update pet config (enable/disable, sprite choice, custom upload).
 * @param {{ enabled?: boolean, sprite?: 'default'|'custom', path?: string }} payload
 */
export function setPet(payload = {}) {
  const next = { ...readConfig() };

  if (typeof payload.enabled === 'boolean') next.enabled = payload.enabled;

  if (payload.sprite === 'default') {
    next.sprite = 'default';
  } else if (payload.sprite === 'custom') {
    if (payload.path) {
      if (!fs.existsSync(payload.path)) return { success: false, error: 'Image not found.' };
      const ext = path.extname(payload.path).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) return { success: false, error: 'Use PNG, JPG, WebP, or GIF.' };
      const dest = path.join(USER_DATA, `custom-pet${ext}`);
      try {
        // Drop any leftover sprite saved under a different extension.
        ALLOWED_EXT.forEach((e) => {
          const f = path.join(USER_DATA, `custom-pet${e}`);
          if (f !== dest && fs.existsSync(f)) fs.unlinkSync(f);
        });
        fs.copyFileSync(payload.path, dest);
      } catch { return { success: false, error: 'Failed to save sprite.' }; }
      next.sprite = 'custom';
      next.customPath = dest;
    } else if (next.customPath && fs.existsSync(next.customPath)) {
      next.sprite = 'custom';
    } else {
      return { success: false, error: 'No custom sprite — upload one first.' };
    }
  }

  writeConfig(next);

  if (next.enabled) {
    createPetWindow();
    sendInit();
  } else {
    destroyPetWindow();
  }
  return { success: true, ...getPet() };
}

export function resetPet() {
  const cfg = readConfig();
  if (cfg.customPath) {
    try { if (fs.existsSync(cfg.customPath)) fs.unlinkSync(cfg.customPath); } catch { /* ignore */ }
  }
  writeConfig({ ...cfg, sprite: 'default', customPath: undefined });
  sendInit();
  return { success: true, ...getPet() };
}
