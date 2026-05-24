// electron/constants.js — Shared constants for the Electron app
import { app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Paths ────────────────────────────────────────────────────────────────────

/** Root of the asyncat-oss monorepo (one level up from electron/) */
export const ROOT = path.resolve(__dirname, '..');

/** Backend entry point */
export const DEN_ENTRY = path.join(ROOT, 'den', 'src', 'index.js');

/** Frontend build output */
export const NEKO_DIST = path.join(ROOT, 'neko', 'dist');

/** Frontend index.html (built) */
export const NEKO_INDEX = path.join(NEKO_DIST, 'index.html');

/** User data directory (OS-specific: ~/Library/Application Support/Asyncat, etc.) */
export const USER_DATA = app.getPath('userData');

/**
 * Working directory for the backend child process.
 *
 * - Dev:        den/   — keeps data in den/data/ as usual
 * - Packaged:   userData — so path.resolve('data', ...) in den resolves to
 *               a real writable OS location instead of inside the read-only asar
 */
export const DEN_CWD = app.isPackaged
  ? USER_DATA
  : path.join(ROOT, 'den');

/** Preload script */
export const PRELOAD_PATH = path.join(__dirname, 'preload.js');

/** Icon paths */
export const ICONS = {
  png:  path.join(ROOT, 'neko', 'public', 'cat-icon-512.png'), // dock — white bg
  tray: path.join(ROOT, 'neko', 'public', 'pwa-96x96.png'),   // menu bar — original (no bg)
  svg:  path.join(ROOT, 'neko', 'public', 'cat-icon.svg'),
};

// ─── Ports ────────────────────────────────────────────────────────────────────

export const BACKEND_PORT  = parseInt(process.env.PORT || '8716', 10);
export const FRONTEND_PORT = parseInt(process.env.ASYNCAT_FRONTEND_PORT || '8717', 10);

export const BACKEND_URL   = `http://localhost:${BACKEND_PORT}`;
export const HEALTH_URL    = `${BACKEND_URL}/health`;

// ─── App Meta ─────────────────────────────────────────────────────────────────

export const APP_NAME    = 'Asyncat';
export const APP_ID      = 'com.asyncat.desktop';
export const IS_DEV      = !app.isPackaged;
export const IS_MAC      = process.platform === 'darwin';
export const IS_WIN      = process.platform === 'win32';
export const IS_LINUX    = process.platform === 'linux';
