// config/configController.js — read/write server config
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWorkspaceRoot } from '../files/fileExplorerService.js';
import { getAllConfig, setConfigValue, isBootstrapKey } from './appConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

const ENV_FILE = path.join(ROOT, 'den', '.env');

const SECRETS = [
  'JWT_SECRET',
  'LOCAL_PASSWORD',
  'HF_TOKEN',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'STABILITY_API_KEY',
  'FAL_KEY',
  'REPLICATE_API_TOKEN',
  'GEMINI_API_KEY',
  'MINIMAX_API_KEY',
  // Integration OAuth credentials
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MAIL_IMAP_PASSWORD',
  'MAIL_SMTP_PASSWORD',
  'NOTIFY_DISCORD_WEBHOOK',
  'NOTIFY_SLACK_WEBHOOK',
  'NOTIFY_TELEGRAM_BOT_TOKEN',
];
const LEGACY_SECRETS = ['SOLO_PASSWORD'];

function maskSecret(value) {
  if (!value || value.length < 8) return '***';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  const result = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

function writeEnv(updates) {
  if (!fs.existsSync(ENV_FILE)) return false;
  const existing = fs.readFileSync(ENV_FILE, 'utf8');
  const lines = existing.split('\n');
  const written = new Set();

  const updated = lines.map(raw => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return raw;
    const idx = line.indexOf('=');
    if (idx < 0) return raw;
    const key = line.slice(0, idx).trim();
    if (key in updates) {
      written.add(key);
      return `${key}=${updates[key]}`;
    }
    return raw;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (!written.has(k)) updated.push(`${k}=${v}`);
  }

  fs.writeFileSync(ENV_FILE, updated.join('\n'), 'utf8');
  return true;
}

// Persist a key: bootstrap values go to den/.env, everything else to the DB.
// Either way the live process.env is updated so the change applies immediately.
function persistConfig(key, value) {
  if (isBootstrapKey(key)) {
    const ok = writeEnv({ [key]: value });
    if (ok) process.env[key] = value;
    return ok;
  }
  setConfigValue(key, value); // also sets process.env[key]
  return true;
}

export function getConfig(req, res) {
  // Merge the bootstrap .env file with DB-backed config; the DB wins for any key
  // it holds (that's where edits now persist), so the UI shows live values.
  const env = { ...readEnv(), ...getAllConfig() };

  const masked = {};
  for (const [k, v] of Object.entries(env)) {
    masked[k] = [...SECRETS, ...LEGACY_SECRETS].includes(k) ? maskSecret(v) : v;
  }

  res.json({
    success: true,
    config: masked,
    runtime: {
      workspaceRoot: getWorkspaceRoot(),
    },
  });
}

export function updateConfig(req, res) {
  const { key, value, restart } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({ success: false, error: 'key and value are required' });
  }

  const allowed = [...SECRETS, 'LOCAL_EMAIL', 'ASYNCAT_WORKSPACE_ROOT', 'WORKSPACE_ROOT', 'LLAMA_SERVER_PORT', 'LLAMA_BINARY_PATH', 'LLAMA_PYTHON_PATH', 'LLAMA_GPU_LAYERS', 'LLAMA_CTX_SIZE', 'MODELS_PATH', 'STORAGE_PATH', 'WHISPER_SERVER_PORT', 'WHISPER_BINARY_PATH', 'TTS_SERVER_PORT', 'PIPER_BINARY_PATH', 'IMAGEGEN_BINARY_PATH', 'COMFYUI_BASE_URL', 'ASYNCAT_STT_PROVIDER', 'ASYNCAT_TTS_PROVIDER', 'ASYNCAT_VISION_PROVIDER', 'ASYNCAT_IMAGE_PROVIDER', 'OBSIDIAN_VAULT_PATH', 'MAIL_IMAP_HOST', 'MAIL_IMAP_PORT', 'MAIL_IMAP_SECURE', 'MAIL_IMAP_USER', 'MAIL_SMTP_HOST', 'MAIL_SMTP_PORT', 'MAIL_SMTP_SECURE', 'MAIL_SMTP_USER', 'MAIL_FROM_EMAIL', 'MAIL_FROM_NAME', 'NOTIFY_EMAIL_TO', 'NOTIFY_TELEGRAM_CHAT_ID', 'NOTIFY_DEFAULT_CHANNELS'];
  if (!allowed.includes(key)) {
    return res.status(400).json({ success: false, error: `Key not allowed: ${key}. Allowed: ${allowed.join(', ')}` });
  }

  const success = persistConfig(key, value);
  if (!success) {
    return res.status(500).json({ success: false, error: 'Failed to write config' });
  }

  res.json({ success: true, message: restart ? 'Config updated. Restart the server to apply changes.' : 'Config updated.' });
}

export function getSecrets(req, res) {
  const env = readEnv();

  const secrets = {};
  for (const s of SECRETS) {
    secrets[s] = env[s] ? maskSecret(env[s]) : '';
  }

  res.json({ success: true, secrets });
}

export function updateSecret(req, res) {
  const { key, value } = req.body;

  if (!SECRETS.includes(key)) {
    return res.status(400).json({ success: false, error: `Invalid secret: ${key}` });
  }

  if (!value || value.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Secret value cannot be empty' });
  }

  const success = persistConfig(key, value);
  if (!success) {
    return res.status(500).json({ success: false, error: 'Failed to write secret' });
  }

  res.json({ success: true, message: 'Secret updated.' });
}
