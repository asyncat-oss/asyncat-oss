import fs from 'fs';
import path from 'path';
import { ROOT } from './env.js';

export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const LEVEL_COLORS = ['dim', 'cyan', 'yellow', 'red', 'magenta'];

function col(color, str) {
  const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
  };
  return `${c[color] || ''}${str}${c.reset}`;
}

function getCliLogsDir() {
  const d = path.join(ROOT, 'logs', 'cli');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

function getLogFile(category) {
  const dir = getCliLogsDir();
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return path.join(dir, `${category}-${yyyy}-${mm}-${dd}.log`);
}

function formatTimestamp() {
  return new Date().toISOString();
}

function formatLevelName(level) {
  return LEVEL_NAMES[level] || 'INFO';
}

function formatColor(level) {
  return LEVEL_COLORS[level] || 'cyan';
}

function writeToFile(filepath, line) {
  try {
    fs.appendFileSync(filepath, line + '\n');
  } catch (_) {}
}

function createLogLine(level, category, message) {
  const ts = formatTimestamp();
  const levelStr = formatLevelName(level).padEnd(5, ' ');
  const catStr = category.padEnd(10, ' ');
  return `[${ts}] [${levelStr}] [${catStr}] ${message}`;
}

class Logger {
  constructor(category) {
    this.category = category;
    this.level = LOG_LEVELS.INFO;
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    } else {
      this.level = level;
    }
  }

  _log(level, message) {
    if (level < this.level) return;

    const line = createLogLine(level, this.category, message);
    const color = formatColor(level);
    const displayLine = `${col(color, line)}`;

    if (process.stdout && !process.stdout.isTTY) {
      process.stdout.write(line + '\n');
    } else {
      console.log(displayLine);
    }

    const filepath = getLogFile(this.category);
    writeToFile(filepath, line);

    if (level >= LOG_LEVELS.ERROR && this.category !== 'error') {
      const errorPath = getLogFile('error');
      writeToFile(errorPath, line);
    }
  }

  debug(message) { this._log(LOG_LEVELS.DEBUG, message); }
  info(message) { this._log(LOG_LEVELS.INFO, message); }
  warn(message) { this._log(LOG_LEVELS.WARN, message); }
  error(message) { this._log(LOG_LEVELS.ERROR, message); }
  fatal(message) { this._log(LOG_LEVELS.FATAL, message); }

  log(message) { this.info(message); }

  ok(message) { this._log(LOG_LEVELS.INFO, `✔ ${message}`); }
  err(message) { this._log(LOG_LEVELS.ERROR, `✖ ${message}`); }
  warn2(message) { this._log(LOG_LEVELS.WARN, `⚠ ${message}`); }
  info2(message) { this._log(LOG_LEVELS.INFO, `→ ${message}`); }
}

const _loggers = new Map();

export function createLogger(category) {
  if (!_loggers.has(category)) {
    _loggers.set(category, new Logger(category));
  }
  return _loggers.get(category);
}

export function getLogger(category) {
  return _loggers.get(category) || createLogger(category);
}

export const logger = {
  ui: createLogger('ui'),
  commands: createLogger('commands'),
  agent: createLogger('agent'),
  error: createLogger('error'),
  startup: createLogger('startup'),
};

export function getLogFiles(category) {
  const dir = getCliLogsDir();
  const files = [];
  try {
    const entries = fs.readdirSync(dir);
    const prefix = category ? `${category}-` : '';
    for (const entry of entries) {
      if (entry.startsWith(prefix) && entry.endsWith('.log')) {
        files.push(path.join(dir, entry));
      }
    }
  } catch (_) {}
  return files.sort().reverse();
}

export function readRecentLogs(category, lines = 100) {
  const dir = getCliLogsDir();
  const prefix = category ? `${category}-` : '';
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayFile = path.join(dir, `${category}-${yyyy}-${mm}-${dd}.log`);

  try {
    if (fs.existsSync(todayFile)) {
      const content = fs.readFileSync(todayFile, 'utf8');
      const allLines = content.split('\n').filter(Boolean);
      return allLines.slice(-lines);
    }
  } catch (_) {}

  return [];
}