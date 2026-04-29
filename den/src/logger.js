import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import winston from 'winston';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOG_ROOT = path.join(ROOT, 'logs', 'backend');

const SENSITIVE_KEY_RE = /^(apikey|api_key|key|token|password|secret|bearer|authorization|database_url|connection_string)$/i;
const SENSITIVE_PATTERNS = [
  /apikey=[^&\s]+/gi,
  /key=[^&\s]+/gi,
  /token=[^&\s]+/gi,
  /password=[^&\s]+/gi,
  /secret=[^&\s]+/gi,
  /bearer [^\s]+/gi,
  /authorization: [^\s]+/gi,
  /postgresql:\/\/[^\s]+/gi,
  /mongodb:\/\/[^\s]+/gi,
  /redis:\/\/[^\s]+/gi,
  /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/]*/gi,
];

function dateStamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ensureDir(category) {
  const dir = path.join(LOG_ROOT, category);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logFile(category) {
  return path.join(ensureDir(category), `${category}-${dateStamp()}.log`);
}

function sanitizeString(value) {
  return SENSITIVE_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, '[REDACTED]'),
    value,
  );
}

function sanitize(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (value instanceof Error) {
    return {
      message: sanitizeString(value.message),
      stack: value.stack ? sanitizeString(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : sanitize(item, depth + 1),
      ]),
    );
  }
  return value;
}

function stringify(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

const redactFormat = winston.format((info) => {
  info.message = stringify(sanitize(info.message));

  const splat = info[Symbol.for('splat')];
  if (Array.isArray(splat) && splat.length > 0) {
    info.message = [info.message, ...splat.map((item) => stringify(sanitize(item)))].join(' ');
    delete info[Symbol.for('splat')];
  }

  return info;
});

const lineFormat = winston.format.printf(({ timestamp, level, message }) =>
  `[${timestamp}] [${level.toUpperCase().padEnd(5)}] ${message}`,
);

const commonFormat = winston.format.combine(
  winston.format.timestamp(),
  redactFormat(),
  lineFormat,
);

function fileTransport(category, options = {}) {
  return new winston.transports.File({
    filename: logFile(category),
    level: options.level || process.env.LOG_LEVEL || 'info',
    format: commonFormat,
  });
}

function consoleTransport() {
  return new winston.transports.Console({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: commonFormat,
  });
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    fileTransport('app'),
    fileTransport('error', { level: 'warn' }),
    consoleTransport(),
  ],
  exitOnError: false,
});

export const httpLogger = winston.createLogger({
  level: 'info',
  transports: [
    fileTransport('http', { level: 'info' }),
    fileTransport('error', { level: 'warn' }),
    consoleTransport(),
  ],
  exitOnError: false,
});

export const morganStream = {
  write(message) {
    httpLogger.info(message.trim());
  },
};

export function logError(message, err) {
  logger.error(message, err);
}

function finishLogger(target) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    target.once('finish', settle);
    target.end();
    setTimeout(settle, 500).unref();
  });
}

export function flushLogs() {
  return Promise.all([
    finishLogger(logger),
    finishLogger(httpLogger),
  ]);
}

export default logger;
