import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG_FILE = path.join(os.homedir(), '.asyncat_config.json');

// ── 256-color / RGB ANSI helpers ─────────────────────────────────────────────
const fg256 = n => `\x1b[38;5;${n}m`;
const bg256 = n => `\x1b[48;5;${n}m`;
const fgRgb = (r,g,b) => `\x1b[38;2;${r};${g};${b}m`;
const bgRgb = (r,g,b) => `\x1b[48;2;${r};${g};${b}m`;

export const THEMES = {
  dark: {
    name:       'dark',
    accent:     '\x1b[35m',      // magenta
    accent2:    '\x1b[36m',      // cyan
    accentBold: '\x1b[1;35m',    // bold magenta
    border:     fg256(239),      // subtle gray
    sugg:       '\x1b[36m',
    inputBg:    bgRgb(30, 30, 35),
    inputFg:    '\x1b[37m',
    dimBorder:  fg256(236),
    highlight:  bgRgb(50, 40, 60),
    statusBg:   bgRgb(25, 25, 30),
    statusFg:   fg256(245),
    logoDim:    fg256(240),
    logoBright: '\x1b[1;35m',
    paletteSel: bgRgb(45, 35, 55),
    paletteCmd: '\x1b[36m',
    msgUser:    '\x1b[36m',
    msgAi:      '\x1b[35m',
    msgSystem:  fg256(245),
    success:    '\x1b[32m',
    warning:    '\x1b[33m',
    error:      '\x1b[31m',
  },
  hacker: {
    name:       'hacker',
    accent:     '\x1b[32m',
    accent2:    '\x1b[92m',
    accentBold: '\x1b[1;32m',
    border:     fg256(236),
    sugg:       '\x1b[92m',
    inputBg:    bgRgb(15, 25, 15),
    inputFg:    '\x1b[32m',
    dimBorder:  fg256(234),
    highlight:  bgRgb(25, 45, 25),
    statusBg:   bgRgb(10, 20, 10),
    statusFg:   fg256(243),
    logoDim:    fg256(238),
    logoBright: '\x1b[1;32m',
    paletteSel: bgRgb(20, 50, 20),
    paletteCmd: '\x1b[92m',
    msgUser:    '\x1b[92m',
    msgAi:      '\x1b[32m',
    msgSystem:  fg256(243),
    success:    '\x1b[92m',
    warning:    '\x1b[33m',
    error:      '\x1b[31m',
  },
  ocean: {
    name:       'ocean',
    accent:     '\x1b[34m',
    accent2:    '\x1b[36m',
    accentBold: '\x1b[1;34m',
    border:     fg256(237),
    sugg:       '\x1b[36m',
    inputBg:    bgRgb(20, 25, 40),
    inputFg:    '\x1b[37m',
    dimBorder:  fg256(235),
    highlight:  bgRgb(30, 40, 65),
    statusBg:   bgRgb(15, 20, 35),
    statusFg:   fg256(245),
    logoDim:    fg256(239),
    logoBright: '\x1b[1;36m',
    paletteSel: bgRgb(25, 35, 60),
    paletteCmd: '\x1b[36m',
    msgUser:    '\x1b[36m',
    msgAi:      '\x1b[34m',
    msgSystem:  fg256(245),
    success:    '\x1b[32m',
    warning:    '\x1b[33m',
    error:      '\x1b[31m',
  },
  minimal: {
    name:       'minimal',
    accent:     '\x1b[37m',
    accent2:    '\x1b[37m',
    accentBold: '\x1b[1;37m',
    border:     fg256(236),
    sugg:       '\x1b[36m',
    inputBg:    bgRgb(28, 28, 28),
    inputFg:    '\x1b[37m',
    dimBorder:  fg256(234),
    highlight:  bgRgb(40, 40, 40),
    statusBg:   bgRgb(22, 22, 22),
    statusFg:   fg256(242),
    logoDim:    fg256(238),
    logoBright: '\x1b[1;37m',
    paletteSel: bgRgb(45, 45, 45),
    paletteCmd: fg256(250),
    msgUser:    fg256(252),
    msgAi:      fg256(248),
    msgSystem:  fg256(242),
    success:    '\x1b[32m',
    warning:    '\x1b[33m',
    error:      '\x1b[31m',
  },
};

let _t = THEMES.dark;

export function loadTheme() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (cfg.theme && THEMES[cfg.theme]) _t = THEMES[cfg.theme];
  } catch {}
}

export function setTheme(name) {
  if (!THEMES[name]) return false;
  _t = THEMES[name];
  try {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
    cfg.theme = name;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch {}
  return true;
}

export const getTheme     = () => _t;
export const getThemeName = () => _t.name;
export const THEME_NAMES  = Object.keys(THEMES);
