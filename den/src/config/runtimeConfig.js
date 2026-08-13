import path from 'path';

const AUTO_DETECT = '(auto-detect)';

export function runtimeEnvFilePath(env = process.env, cwd = process.cwd()) {
  const configured = String(env.ASYNCAT_ENV_PATH || '').trim();
  return configured ? path.resolve(configured) : path.resolve(cwd, '.env');
}

export function runtimeDataRoot(env = process.env, cwd = process.cwd()) {
  const configured = String(env.ASYNCAT_DATA_PATH || '').trim();
  return configured ? path.resolve(configured) : path.resolve(cwd, 'data');
}

export function runtimeDataPath(...segments) {
  return path.join(runtimeDataRoot(), ...segments);
}

export function runtimeModelsPath(env = process.env, cwd = process.cwd()) {
  const configured = String(env.MODELS_PATH || '').trim();
  return configured ? path.resolve(cwd, configured) : path.join(runtimeDataRoot(env, cwd), 'models');
}

export function runtimeGeneratedImagesPath(env = process.env, cwd = process.cwd()) {
  const configured = String(env.IMAGEGEN_OUTPUT_PATH || '').trim();
  return configured
    ? path.resolve(cwd, configured)
    : path.join(runtimeDataRoot(env, cwd), 'generated', 'images');
}

export function getRuntimeConfigDefaults(env = process.env, cwd = process.cwd()) {
  const dataRoot = runtimeDataRoot(env, cwd);
  return {
    PORT: '8716',
    NODE_ENV: 'development',
    FRONTEND_URL: 'http://127.0.0.1:8717',
    DB_PATH: path.join(dataRoot, 'asyncat.db'),
    LLAMA_SERVER_PORT: '8765',
    MLX_SERVER_PORT: '8766',
    MODELS_PATH: path.join(dataRoot, 'models'),
    STORAGE_PATH: path.join(dataRoot, 'uploads'),
    WHISPER_SERVER_PORT: '8767',
    WHISPER_BINARY_PATH: AUTO_DETECT,
    TTS_SERVER_PORT: '8768',
    PIPER_BINARY_PATH: AUTO_DETECT,
    IMAGEGEN_BINARY_PATH: AUTO_DETECT,
    COMFYUI_BASE_URL: 'http://127.0.0.1:8188',
    MLX_PYTHON_PATH: AUTO_DETECT,
    MLX_MODELS_PATH: AUTO_DETECT,
  };
}

const RESOLVED_PATH_KEYS = new Set([
  'DB_PATH',
  'MODELS_PATH',
  'STORAGE_PATH',
  'WHISPER_BINARY_PATH',
  'PIPER_BINARY_PATH',
  'IMAGEGEN_BINARY_PATH',
  'MLX_PYTHON_PATH',
  'MLX_MODELS_PATH',
]);

function resolveConfiguredPath(key, value, cwd) {
  if (!RESOLVED_PATH_KEYS.has(key) || !value || value === AUTO_DETECT) return value;
  return path.resolve(cwd, value);
}

export function buildEffectiveRuntimeConfig({
  fileConfig = {},
  databaseConfig = {},
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const defaults = getRuntimeConfigDefaults(env, cwd);
  const declared = { ...fileConfig, ...databaseConfig };
  const keys = new Set([...Object.keys(defaults), ...Object.keys(declared)]);
  const config = {};
  const sources = {};

  for (const key of keys) {
    let value;
    let source;
    if (Object.prototype.hasOwnProperty.call(databaseConfig, key)) {
      value = databaseConfig[key];
      source = 'database';
    } else if (
      Object.prototype.hasOwnProperty.call(env, key)
      && (!Object.prototype.hasOwnProperty.call(fileConfig, key) || String(env[key]) !== String(fileConfig[key]))
    ) {
      value = env[key];
      source = 'environment';
    } else if (Object.prototype.hasOwnProperty.call(fileConfig, key)) {
      value = fileConfig[key];
      source = 'environment file';
    } else if (Object.prototype.hasOwnProperty.call(env, key)) {
      value = env[key];
      source = 'environment';
    } else {
      value = defaults[key];
      source = 'default';
    }

    config[key] = resolveConfiguredPath(key, String(value ?? ''), cwd);
    sources[key] = source;
  }

  return { config, sources };
}

export { AUTO_DETECT };
