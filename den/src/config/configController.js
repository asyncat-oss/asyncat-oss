// config/configController.js — read/write server config
import { getWorkspaceRoot } from '../files/fileExplorerService.js';
import { getAllConfig, setConfigValue, isBootstrapKey } from './appConfig.js';
import { ENV_FILE, readEnv as readEnvFile, writeEnv } from '../lib/env.js';
import { buildEffectiveRuntimeConfig, runtimeDataRoot } from './runtimeConfig.js';

const SECRETS = [
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

function maskSecret(value) {
  if (!value || value.length < 8) return '***';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

const readEnv = () => readEnvFile(ENV_FILE);

function maskConfig(config) {
  const masked = {};
  for (const [key, value] of Object.entries(config)) {
    masked[key] = SECRETS.includes(key) ? maskSecret(value) : value;
  }
  return masked;
}

// Persist a key: bootstrap values go to the active runtime .env, everything
// else to the DB. In packaged Electron that .env is inside userData.
// Either way the live process.env is updated so the change applies immediately.
function persistConfig(key, value) {
  try {
    if (isBootstrapKey(key)) {
      writeEnv(ENV_FILE, { [key]: value });
      process.env[key] = value;
      return true;
    }
    setConfigValue(key, value); // also sets process.env[key]
    return true;
  } catch (error) {
    console.error(`[config] Failed to persist ${key}:`, error.message);
    return false;
  }
}

export function getConfig(req, res) {
  const fileConfig = readEnv();
  const databaseConfig = getAllConfig();
  const rawConfig = { ...fileConfig, ...databaseConfig };
  const effective = buildEffectiveRuntimeConfig({ fileConfig, databaseConfig });

  res.json({
    success: true,
    // Keep raw config for existing setup screens and add an explicit resolved
    // snapshot for diagnostics. Defaults are never mistaken for "not set".
    config: maskConfig(rawConfig),
    effectiveConfig: maskConfig(effective.config),
    configSources: effective.sources,
    runtime: {
      workspaceRoot: getWorkspaceRoot(),
      envFile: ENV_FILE,
      dataRoot: runtimeDataRoot(),
      desktop: process.env.ASYNCAT_DESKTOP === '1',
    },
  });
}

export function updateConfig(req, res) {
  const { key, value } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({ success: false, error: 'key and value are required' });
  }

  const allowed = [...SECRETS, 'ASYNCAT_WORKSPACE_ROOT', 'WORKSPACE_ROOT', 'LLAMA_SERVER_PORT', 'LLAMA_BINARY_PATH', 'LLAMA_PYTHON_PATH', 'LLAMA_GPU_LAYERS', 'LLAMA_CTX_SIZE', 'MLX_SERVER_PORT', 'MLX_PYTHON_PATH', 'MLX_MODELS_PATH', 'MODELS_PATH', 'STORAGE_PATH', 'WHISPER_SERVER_PORT', 'WHISPER_BINARY_PATH', 'TTS_SERVER_PORT', 'PIPER_BINARY_PATH', 'IMAGEGEN_BINARY_PATH', 'IMAGEGEN_OUTPUT_PATH', 'COMFYUI_BASE_URL', 'ASYNCAT_STT_PROVIDER', 'ASYNCAT_TTS_PROVIDER', 'ASYNCAT_VISION_PROVIDER', 'ASYNCAT_IMAGE_PROVIDER', 'OBSIDIAN_VAULT_PATH', 'MAIL_IMAP_HOST', 'MAIL_IMAP_PORT', 'MAIL_IMAP_SECURE', 'MAIL_IMAP_USER', 'MAIL_SMTP_HOST', 'MAIL_SMTP_PORT', 'MAIL_SMTP_SECURE', 'MAIL_SMTP_USER', 'MAIL_FROM_EMAIL', 'MAIL_FROM_NAME', 'NOTIFY_EMAIL_TO', 'NOTIFY_TELEGRAM_CHAT_ID', 'NOTIFY_DEFAULT_CHANNELS'];
  if (!allowed.includes(key)) {
    return res.status(400).json({ success: false, error: `Key not allowed: ${key}. Allowed: ${allowed.join(', ')}` });
  }

  const success = persistConfig(key, value);
  if (!success) {
    return res.status(500).json({ success: false, error: 'Failed to write config' });
  }

  const restartRequired = isBootstrapKey(key);
  res.json({
    success: true,
    restartRequired,
    message: restartRequired
      ? 'Config updated. Restart the server to apply changes.'
      : 'Config updated and applied.',
  });
}

export function getSecrets(req, res) {
  const env = { ...readEnv(), ...getAllConfig() };

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
