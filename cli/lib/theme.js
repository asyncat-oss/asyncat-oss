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
    screenBg:   bgRgb(22, 22, 25),
    screenFg:   fg256(252),
    panelBg:    bgRgb(28, 28, 33),
    panelFg:    fg256(252),
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
    screenBg:   bgRgb(7, 12, 8),
    screenFg:   fg256(120),
    panelBg:    bgRgb(10, 22, 12),
    panelFg:    fg256(120),
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
    screenBg:   bgRgb(10, 16, 28),
    screenFg:   fg256(252),
    panelBg:    bgRgb(15, 23, 40),
    panelFg:    fg256(252),
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
    screenBg:   bgRgb(18, 18, 18),
    screenFg:   fg256(250),
    panelBg:    bgRgb(24, 24, 24),
    panelFg:    fg256(250),
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
  parchment: {
    name:       'parchment',
    screenBg:   bgRgb(244, 237, 219),
    screenFg:   fgRgb(57, 61, 55),
    panelBg:    bgRgb(235, 230, 208),
    panelFg:    fgRgb(57, 61, 55),
    accent:     fgRgb(131, 151, 0),
    accent2:    fgRgb(42, 120, 132),
    accentBold: `${fgRgb(131, 151, 0)}\x1b[1m`,
    border:     fgRgb(178, 173, 151),
    sugg:       fgRgb(42, 120, 132),
    inputBg:    bgRgb(235, 230, 208),
    inputFg:    fgRgb(45, 48, 45),
    dimBorder:  fgRgb(189, 184, 161),
    highlight:  bgRgb(220, 225, 190),
    statusBg:   bgRgb(244, 237, 219),
    statusFg:   fgRgb(118, 124, 110),
    logoDim:    fgRgb(139, 151, 135),
    logoBright: `${fgRgb(74, 83, 93)}\x1b[1m`,
    paletteSel: bgRgb(133, 153, 0),
    paletteCmd: fgRgb(38, 96, 114),
    msgUser:    fgRgb(42, 120, 132),
    msgAi:      fgRgb(131, 151, 0),
    msgSystem:  fgRgb(118, 124, 110),
    success:    fgRgb(92, 130, 50),
    warning:    fgRgb(176, 111, 30),
    error:      fgRgb(190, 60, 55),
  },
  graphite: {
    name:       'graphite',
    screenBg:   bgRgb(14, 15, 17),
    screenFg:   fg256(253),
    panelBg:    bgRgb(23, 24, 28),
    panelFg:    fg256(253),
    accent:     fgRgb(255, 126, 73),
    accent2:    fgRgb(139, 213, 202),
    accentBold: `${fgRgb(255, 126, 73)}\x1b[1m`,
    border:     fg256(240),
    sugg:       fgRgb(139, 213, 202),
    inputBg:    bgRgb(24, 25, 29),
    inputFg:    fg256(253),
    dimBorder:  fg256(238),
    highlight:  bgRgb(48, 41, 37),
    statusBg:   bgRgb(14, 15, 17),
    statusFg:   fg256(244),
    logoDim:    fg256(239),
    logoBright: `${fgRgb(255, 126, 73)}\x1b[1m`,
    paletteSel: bgRgb(76, 48, 37),
    paletteCmd: fgRgb(139, 213, 202),
    msgUser:    fgRgb(139, 213, 202),
    msgAi:      fgRgb(255, 126, 73),
    msgSystem:  fg256(245),
    success:    fgRgb(126, 200, 112),
    warning:    fgRgb(245, 190, 82),
    error:      fgRgb(239, 94, 94),
  },
  aurora: {
    name:       'aurora',
    screenBg:   bgRgb(13, 18, 29),
    screenFg:   fg256(252),
    panelBg:    bgRgb(20, 27, 43),
    panelFg:    fg256(252),
    accent:     fgRgb(122, 162, 247),
    accent2:    fgRgb(187, 154, 247),
    accentBold: `${fgRgb(122, 162, 247)}\x1b[1m`,
    border:     fgRgb(62, 72, 94),
    sugg:       fgRgb(187, 154, 247),
    inputBg:    bgRgb(20, 27, 43),
    inputFg:    fg256(252),
    dimBorder:  fgRgb(45, 53, 72),
    highlight:  bgRgb(40, 50, 80),
    statusBg:   bgRgb(13, 18, 29),
    statusFg:   fgRgb(150, 160, 180),
    logoDim:    fgRgb(68, 78, 102),
    logoBright: `${fgRgb(122, 162, 247)}\x1b[1m`,
    paletteSel: bgRgb(42, 54, 91),
    paletteCmd: fgRgb(187, 154, 247),
    msgUser:    fgRgb(122, 162, 247),
    msgAi:      fgRgb(187, 154, 247),
    msgSystem:  fgRgb(150, 160, 180),
    success:    fgRgb(158, 206, 106),
    warning:    fgRgb(224, 175, 104),
    error:      fgRgb(247, 118, 142),
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

export function setThemePreview(name) {
  if (!THEMES[name]) return false;
  _t = THEMES[name];
  return true;
}

export const getTheme     = () => _t;
export const getThemeName = () => _t.name;
export const THEME_NAMES  = Object.keys(THEMES);
