import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import updateRouter from '../src/update/updateRouter.js';
import { cudaVersionFromReleaseAsset, isCudaRuntimeCompanionAsset } from '../src/lib/releaseAssetUtils.js';
import {
  inspectWindowsCudaRuntimeBundle,
  rankLlamaReleaseAssets,
  verificationTimeoutForAsset,
  verifyBinaryDetailedAsync,
} from '../src/lib/localEngine.js';
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

test('CUDA dependency archives are never selected as the primary llama.cpp engine', () => {
  assert.equal(isCudaRuntimeCompanionAsset('cudart-llama-bin-win-cuda-12.4-x64.zip'), true);
  assert.equal(isCudaRuntimeCompanionAsset('cudart_llama-bin-win-cuda-13.3-x64.zip'), true);
  assert.equal(isCudaRuntimeCompanionAsset('llama-b10549-bin-win-cuda-12.4-x64.zip'), false);
  assert.deepEqual(cudaVersionFromReleaseAsset('llama-b10549-bin-win-cuda-12.4-x64.zip'), {
    major: 12,
    minor: 4,
    text: '12.4',
  });
});

test('CUDA verification gets a longer startup window while honoring an explicit override', () => {
  assert.equal(verificationTimeoutForAsset('llama-b10549-bin-win-cuda-12.4-x64.zip', {}), 120000);
  assert.equal(verificationTimeoutForAsset('llama-b10549-bin-win-cpu-x64.zip', {}), 30000);
  assert.equal(
    verificationTimeoutForAsset('llama-b10549-bin-win-cuda-12.4-x64.zip', { ASYNCAT_LLAMA_VERIFY_TIMEOUT_MS: '45000' }),
    45000
  );
});

test('NVIDIA runtime selection recognizes dashed CUDA versions and prefers CUDA 12 compatibility', () => {
  const assets = [
    { name: 'llama-b10549-bin-win-cuda-13.3-x64.zip', browser_download_url: 'https://example.invalid/cuda13' },
    { name: 'llama-b10549-bin-win-cuda-12.4-x64.zip', browser_download_url: 'https://example.invalid/cuda12' },
  ];
  const ranked = rankLlamaReleaseAssets(assets, 'win32', 'x64', 'nvidia_gpu');
  assert.equal(ranked[0].name, 'llama-b10549-bin-win-cuda-12.4-x64.zip');
});

test('Windows CUDA bundle inspection requires the engine and portable CUDA DLLs together', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-cuda-bundle-test-'));
  try {
    for (const name of ['ggml-cuda.dll', 'cudart64_12.dll', 'cublas64_12.dll', 'cublasLt64_12.dll']) {
      fs.writeFileSync(path.join(root, name), 'test');
    }
    assert.equal(inspectWindowsCudaRuntimeBundle(root, 'llama-bin-win-cuda-12.4-x64.zip').ok, true);
    fs.unlinkSync(path.join(root, 'cublasLt64_12.dll'));
    const incomplete = inspectWindowsCudaRuntimeBundle(root, 'llama-bin-win-cuda-12.4-x64.zip');
    assert.equal(incomplete.ok, false);
    assert.deepEqual(incomplete.missingDlls, ['cublasLt64_12.dll']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('async binary verification accepts a healthy executable without blocking the server loop', async () => {
  const result = await verifyBinaryDetailedAsync(process.execPath, { timeoutMs: 5000 });
  assert.equal(result.ok, true, result.detail);
  assert.equal(result.acceptedProbe, '--version');
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
