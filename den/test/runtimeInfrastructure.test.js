import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import updateRouter from '../src/update/updateRouter.js';
import {
  buildEffectiveRuntimeConfig,
  runtimeDataRoot,
  runtimeEnvFilePath,
  runtimeHome,
  runtimeModelsPath,
} from '../src/config/runtimeConfig.js';

test('packaged runtime paths honor explicit writable roots', () => {
  const cwd = path.resolve('source-root');
  const env = {
    ASYNCAT_ENV_PATH: path.join(cwd, 'user-data', '.env'),
    ASYNCAT_DATA_PATH: path.join(cwd, 'user-data', 'data'),
  };

  assert.equal(runtimeEnvFilePath(env, cwd), path.resolve(env.ASYNCAT_ENV_PATH));
  assert.equal(runtimeDataRoot(env, cwd), path.resolve(env.ASYNCAT_DATA_PATH));
  assert.equal(runtimeModelsPath(env, cwd), path.join(path.resolve(env.ASYNCAT_DATA_PATH), 'models'));
});

test('managed runtimes honor the Asyncat-owned home override', () => {
  const cwd = path.resolve('runtime-root');
  const configured = path.join(cwd, 'user-data', 'asyncat-home');

  assert.equal(runtimeHome({ ASYNCAT_HOME: configured }, cwd), path.resolve(configured));
  assert.equal(runtimeHome({ ASYNCAT_HOME: './isolated-home' }, cwd), path.join(cwd, 'isolated-home'));
});

test('effective runtime config resolves defaults and reports value sources', () => {
  const cwd = path.resolve('runtime-cwd');
  const result = buildEffectiveRuntimeConfig({
    cwd,
    env: { PORT: '9999' },
    fileConfig: { PORT: '8716', DB_PATH: './custom/app.db' },
    databaseConfig: { LLAMA_SERVER_PORT: '9777' },
  });

  assert.equal(result.config.PORT, '9999');
  assert.equal(result.sources.PORT, 'environment');
  assert.equal(result.config.DB_PATH, path.resolve(cwd, 'custom/app.db'));
  assert.equal(result.sources.DB_PATH, 'environment file');
  assert.equal(result.config.LLAMA_SERVER_PORT, '9777');
  assert.equal(result.sources.LLAMA_SERVER_PORT, 'database');
  assert.equal(result.config.WHISPER_SERVER_PORT, '8767');
  assert.equal(result.sources.WHISPER_SERVER_PORT, 'default');
});

test('update router exposes both status and graceful restart endpoints', () => {
  const routes = updateRouter.stack
    .map(layer => layer.route)
    .filter(Boolean)
    .map(route => ({ path: route.path, methods: route.methods }));

  assert.ok(routes.some(route => route.path === '/status' && route.methods.get));
  assert.ok(routes.some(route => route.path === '/restart' && route.methods.post));
});
