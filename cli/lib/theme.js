import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG_FILE = path.join(os.homedir(), '.asyncat_config.json');

export const THEMES = {
  dark: {
    name:    'dark',
    accent:  '\x1b[35m',    // magenta
    accent2: '\x1b[36m',    // cyan
    border:  '\x1b[35m',
    sugg:    '\x1b[36m',
  },
  hacker: {
    name:    'hacker',
    accent:  '\x1b[32m',    // green
    accent2: '\x1b[92m',    // bright green
    border:  '\x1b[32m',
    sugg:    '\x1b[92m',
  },
  ocean: {
    name:    'ocean',
    accent:  '\x1b[34m',    // blue
    accent2: '\x1b[36m',    // cyan
    border:  '\x1b[34m',
    sugg:    '\x1b[36m',
  },
  minimal: {
    name:    'minimal',
    accent:  '\x1b[37m',    // white
    accent2: '\x1b[37m',
    border:  '\x1b[2m',     // dim
    sugg:    '\x1b[36m',
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
