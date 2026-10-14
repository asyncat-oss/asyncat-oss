// config/configController.js — read/write server config
import { getWorkspaceRoot } from '../files/fileExplorerService.js';
import { getAllConfig, setConfigValue, deleteConfigValue, isBootstrapKey } from './appConfig.js';
import { ENV_FILE, readEnv as readEnvFile, writeEnv } from '../lib/env.js';
import { buildEffectiveRuntimeConfig, runtimeDataRoot } from './runtimeConfig.js';
import { SECRET_CONFIG_KEYS } from '../db/sealSecrets.js';

const SECRETS = SECRET_CONFIG_KEYS;

// Enough to tell which key is stored without revealing a useful part of it.
export function maskSecret(value) {
  if (!value) return '';
  const text = String(value);
  return text.length < 12 ? '****' : `****${text.slice(-4)}`;
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

  const allowed = [...SECRETS, 'ASYNCAT_WORKSPACE_ROOT', 'WORKSPACE_ROOT', 'LLAMA_SERVER_PORT', 'LLAMA_BINARY_PATH', 'LLAMA_PYTHON_PATH', 'LLAMA_GPU_LAYERS', 'LLAMA_CTX_SIZE', 'MLX_SERVER_PORT', 'MLX_PYTHON_PATH', 'MLX_MODELS_PATH', 'MODELS_PATH', 'STORAGE_PATH', 'WHISPER_SERVER_PORT', 'WHISPER_BINARY_PATH', 'TTS_SERVER_PORT', 'PIPER_BINARY_PATH', 'IMAGEGEN_BINARY_PATH', 'IMAGEGEN_OUTPUT_PATH', 'COMFYUI_BASE_URL', 'COMFYUI_CHECKPOINT', 'ASYNCAT_STT_PROVIDER', 'ASYNCAT_TTS_PROVIDER', 'ASYNCAT_VISION_PROVIDER', 'ASYNCAT_IMAGE_PROVIDER', 'ASYNCAT_STT_MODEL', 'ASYNCAT_TTS_VOICE', 'ASYNCAT_IMAGE_MODEL', 'OPENAI_STT_MODEL', 'OPENAI_TTS_MODEL', 'OPENAI_TTS_VOICE', 'OPENAI_IMAGE_MODEL', 'GEMINI_TTS_VOICE', 'GEMINI_IMAGE_MODEL', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_TTS_MODEL', 'ELEVENLABS_STT_MODEL', 'FAL_TTS_VOICE', 'MAIL_IMAP_HOST', 'MAIL_IMAP_PORT', 'MAIL_IMAP_SECURE', 'MAIL_IMAP_USER', 'MAIL_SMTP_HOST', 'MAIL_SMTP_PORT', 'MAIL_SMTP_SECURE', 'MAIL_SMTP_USER', 'MAIL_FROM_EMAIL', 'MAIL_FROM_NAME', 'NOTIFY_EMAIL_TO', 'NOTIFY_TELEGRAM_CHAT_ID', 'NOTIFY_DEFAULT_CHANNELS', 'ASYNCAT_COMMAND_SANDBOX'];
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
  const body = req.body || {};
  const { key, value } = body;

  if (!SECRETS.includes(key)) {
    return res.status(400).json({ success: false, error: `Invalid secret: ${key}` });
  }

  // A request with no value at all is a mistake, never a removal.
  if (!Object.hasOwn(body, 'value')) {
    return res.status(400).json({ success: false, error: 'Secret value is missing' });
  }

  // An empty value removes the key.
  if (!String(value ?? '').trim()) {
    try {
      deleteConfigValue(key);
    } catch (error) {
      console.error(`[config] Failed to remove ${key}:`, error.message);
      return res.status(500).json({ success: false, error: 'Failed to remove secret' });
    }
    return res.json({ success: true, removed: true, message: 'Secret removed.' });
  }

  const success = persistConfig(key, value);
  if (!success) {
    return res.status(500).json({ success: false, error: 'Failed to write secret' });
  }

  res.json({ success: true, message: 'Secret updated.' });
}
