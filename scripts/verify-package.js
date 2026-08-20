#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import http from 'http';
import net from 'net';
import os from 'os';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  throw new Error(message);
}

function findPackagedApps(directory, depth = 0) {
  if (depth > 7 || !existsSync(directory)) return [];
  const packagePath = path.join(directory, 'package.json');
  if (existsSync(packagePath) && existsSync(path.join(directory, 'den', 'src', 'index.js'))) return [directory];

  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    matches.push(...findPackagedApps(path.join(directory, entry.name), depth + 1));
  }
  return matches;
}

function findSensitiveRuntimeFiles(denDirectory) {
  const matches = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (
        entry.name === '.env'
        || entry.name === 'mcp.json'
        || /\.db(?:-(?:shm|wal))?$/i.test(entry.name)
      ) {
        matches.push(path.relative(denDirectory, fullPath));
      }
    }
  };
  visit(denDirectory);
  return matches;
}

function packageJsonPath(baseDirectory, packageName) {
  return path.join(baseDirectory, 'node_modules', ...packageName.split('/'), 'package.json');
}

function verifyRuntime(appDirectory, expectedArch) {
  const resourceDirectory = path.dirname(appDirectory);
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
  const nodePath = path.join(resourceDirectory, 'node-bin', nodeName);
  if (!existsSync(nodePath)) fail(`Bundled Node.js is missing: ${nodePath}`);

  const denPackagePath = path.join(appDirectory, 'den', 'package.json');
  const denPackage = JSON.parse(readFileSync(denPackagePath, 'utf8'));
  const dependencies = Object.keys(denPackage.dependencies || {});
  if (dependencies.length === 0) fail('den/package.json declares no runtime dependencies.');

  const expectedVersions = Object.fromEntries(dependencies.map((name) => {
    const sourcePackagePath = packageJsonPath(ROOT, name);
    if (!existsSync(sourcePackagePath)) fail(`Source dependency is not installed: ${name}`);
    return [name, JSON.parse(readFileSync(sourcePackagePath, 'utf8')).version];
  }));

  const probe = `
    const fs = require('fs');
    const path = require('path');
    const { createRequire } = require('module');
    const req = createRequire(${JSON.stringify(denPackagePath)});
    const expected = ${JSON.stringify(expectedArch)};
    if (expected && process.arch !== expected) {
      throw new Error('bundled Node architecture is ' + process.arch + ', expected ' + expected);
    }
    const expectedVersions = ${JSON.stringify(expectedVersions)};
    for (const name of ${JSON.stringify(dependencies)}) {
      const packagePath = path.join(${JSON.stringify(appDirectory)}, 'node_modules', ...name.split('/'), 'package.json');
      if (!fs.existsSync(packagePath)) throw new Error('missing backend dependency: ' + name);
      const actualVersion = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
      if (actualVersion !== expectedVersions[name]) {
        throw new Error('wrong backend dependency version: ' + name + '@' + actualVersion + ', expected ' + expectedVersions[name]);
      }
    }
    req('better-sqlite3');
    req('canvas');
    console.log('runtime-ok ' + process.platform + '/' + process.arch);
  `;
  const result = spawnSync(nodePath, ['-e', probe], {
    cwd: appDirectory,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
  });
  if (result.status !== 0) {
    fail(`Packaged runtime probe failed:\n${result.stdout || ''}${result.stderr || ''}`);
  }
  process.stdout.write(result.stdout);
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error('Could not allocate a backend verification port.'));
        else resolve(port);
      });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(port, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const healthy = await new Promise((resolve) => {
      const request = http.get(`http://127.0.0.1:${port}/health`, (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      });
      request.setTimeout(1_000, () => request.destroy());
      request.once('error', () => resolve(false));
    });
    if (healthy) return;
    await delay(300);
  }
  throw new Error(`Backend health check timed out after ${timeoutMs}ms.`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try { child.kill('SIGTERM'); } catch {}
  await Promise.race([exited, delay(5_000)]);
  if (child.exitCode === null) {
    try { child.kill('SIGKILL'); } catch {}
    await Promise.race([exited, delay(2_000)]);
  }
}

async function verifyBackendStartup(appDirectory) {
  const resourceDirectory = path.dirname(appDirectory);
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
  const nodePath = path.join(resourceDirectory, 'node-bin', nodeName);
  const entryPath = path.join(appDirectory, 'den', 'src', 'index.js');
  const tempRoot = path.resolve(os.tmpdir());
  const testDirectory = mkdtempSync(path.join(tempRoot, 'asyncat-package-verify-'));
  const dataDirectory = path.join(testDirectory, 'data');
  const logDirectory = path.join(testDirectory, 'logs');
  mkdirSync(dataDirectory, { recursive: true });
  mkdirSync(logDirectory, { recursive: true });

  let child;
  let output = '';
  try {
    const port = await getAvailablePort();
    child = spawn(nodePath, [entryPath], {
      cwd: testDirectory,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'production',
        FRONTEND_URL: 'http://127.0.0.1:8717',
        PUBLIC_URL: `http://127.0.0.1:${port}`,
        DB_PATH: path.join(dataDirectory, 'asyncat.db'),
        STORAGE_PATH: path.join(dataDirectory, 'uploads'),
        MODELS_PATH: path.join(dataDirectory, 'models'),
        ASYNCAT_LOG_DIR: logDirectory,
        ASYNCAT_ENV_PATH: path.join(testDirectory, '.env'),
        ASYNCAT_DATA_PATH: dataDirectory,
        ASYNCAT_DESKTOP: '1',
        ELECTRON_RUN_AS_NODE: undefined,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const appendOutput = (data) => {
      output = `${output}${String(data || '')}`.slice(-64 * 1024);
    };
    child.stdout?.on('data', appendOutput);
    child.stderr?.on('data', appendOutput);

    const exitedEarly = new Promise((_, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        reject(new Error(`Backend exited before becoming healthy (code=${code}, signal=${signal || 'none'}).`));
      });
    });
    await Promise.race([waitForHealth(port), exitedEarly]);
    console.log(`backend-health-ok 127.0.0.1:${port}`);
  } catch (error) {
    const details = output.trim();
    fail(`Packaged backend startup probe failed:\n${error.message}${details ? `\n${details}` : ''}`);
  } finally {
    await stopProcess(child);
    const resolvedTestDirectory = path.resolve(testDirectory);
    if (
      path.dirname(resolvedTestDirectory) !== tempRoot
      || !path.basename(resolvedTestDirectory).startsWith('asyncat-package-verify-')
    ) {
      fail(`Refusing to clean unexpected verification directory: ${resolvedTestDirectory}`);
    }
    rmSync(resolvedTestDirectory, { recursive: true, force: true });
  }
}

function verifyElectronNativeModule(appDirectory, expectedArch) {
  const resourceDirectory = path.dirname(appDirectory);
  const bundleDirectory = path.dirname(resourceDirectory);
  const candidates = process.platform === 'win32'
    ? [path.join(bundleDirectory, 'Asyncat.exe')]
    : process.platform === 'darwin'
      ? [path.join(bundleDirectory, 'MacOS', 'Asyncat')]
      : [
        path.join(bundleDirectory, 'asyncat'),
        path.join(bundleDirectory, 'Asyncat'),
        path.join(bundleDirectory, 'asyncat-oss'),
      ];
  const executable = candidates.find(existsSync);
  if (!executable) fail(`Could not locate the packaged Electron executable: ${candidates.join(', ')}`);

  const probe = `
    const { createRequire } = require('module');
    if (process.arch !== ${JSON.stringify(expectedArch)}) {
      throw new Error('Electron architecture is ' + process.arch + ', expected ' + ${JSON.stringify(expectedArch)});
    }
    createRequire(${JSON.stringify(path.join(appDirectory, 'package.json'))})('node-pty');
    console.log('electron-native-ok ' + process.platform + '/' + process.arch);
  `;
  const result = spawnSync(executable, ['-e', probe], {
    cwd: appDirectory,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  if (result.status !== 0) {
    fail(`Electron native-module probe failed:\n${result.stdout || ''}${result.stderr || ''}`);
  }
  process.stdout.write(result.stdout);
}

export async function verifyPackage({ releaseDirectory = path.join(ROOT, 'release'), appDirectory, expectedArch = process.arch } = {}) {
  const apps = appDirectory ? [path.resolve(appDirectory)] : findPackagedApps(path.resolve(releaseDirectory));
  if (apps.length !== 1) fail(`Expected exactly one unpacked app, found ${apps.length}: ${apps.join(', ')}`);

  const packagedApp = apps[0];
  const requiredFiles = [
    'package.json',
    'electron/main.js',
    'den/package.json',
    'den/src/index.js',
    'neko/dist/index.html',
  ];
  for (const relativePath of requiredFiles) {
    if (!existsSync(path.join(packagedApp, relativePath))) fail(`Missing packaged file: ${relativePath}`);
  }
  if (existsSync(path.join(packagedApp, 'node_modules', 'den'))) {
    fail('The den workspace was duplicated under node_modules/den; this can leak local runtime files.');
  }

  const sensitive = findSensitiveRuntimeFiles(path.join(packagedApp, 'den'));
  if (sensitive.length > 0) fail(`Sensitive/runtime files were packaged: ${sensitive.join(', ')}`);

  verifyRuntime(packagedApp, expectedArch);
  verifyElectronNativeModule(packagedApp, expectedArch);
  await verifyBackendStartup(packagedApp);
  const size = statSync(packagedApp).isDirectory() ? 'directory' : 'file';
  console.log(`[release] Verified ${size}: ${packagedApp}`);
  return packagedApp;
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await verifyPackage({
      releaseDirectory: option('release-dir') || undefined,
      appDirectory: option('app-dir') || undefined,
      expectedArch: option('arch') || process.arch,
    });
  } catch (error) {
    console.error(`[release] ${error.message}`);
    process.exitCode = 1;
  }
}
