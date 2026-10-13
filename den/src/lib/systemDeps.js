// den/src/lib/systemDeps.js — which system tools this machine has, for the
// installer readiness report (GET /api/install/readiness) and the agent's
// install tools.
//
// About 40 probes run here (versions, Python's venv and pip, MLX imports).
// They run as child processes awaited in parallel, never on the request
// thread, and the report is cached for a minute; ?refresh=1 (Recheck) and
// finished installs ask again.

import os from 'os';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { runtimeHome } from '../config/runtimeConfig.js';
import { findOnPath } from './engineArchive.js';

const isWin = process.platform === 'win32';
const isDesktopRuntime = process.env.ASYNCAT_DESKTOP === '1';
const REPORT_TTL_MS = 60 * 1000;

function run(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      encoding: 'utf8',
      timeout: options.timeout || 8000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      ...options,
    }, (error, stdout) => {
      if (error) resolve({ ok: false, stdout: '', error: error.message });
      else resolve({ ok: true, stdout: String(stdout || '').trim() });
    });
  });
}

// Apps started from a desktop launcher often miss PATH entries the user's
// shell profile adds (Homebrew, ~/.local/bin). Ask a login shell for its PATH
// once, instead of starting a login shell for every command.
let loginPathPromise = null;
function loginShellPath() {
  if (isWin) return Promise.resolve('');
  loginPathPromise ||= run('sh', ['-lc', 'printf %s "$PATH"'], { timeout: 5000 })
    .then(result => (result.ok ? result.stdout : ''));
  return loginPathPromise;
}

async function searchPath() {
  const parts = [process.env.PATH || process.env.Path || '', await loginShellPath()]
    .join(path.delimiter)
    .split(path.delimiter)
    .filter(Boolean);
  return [...new Set(parts)].join(path.delimiter);
}

/** The full path of `command` (on PATH, or an absolute path that exists), or null. */
export async function findCommand(command) {
  if (!command) return null;
  if (path.isAbsolute(command)) return fs.existsSync(command) ? command : null;
  return findOnPath(command, { ...process.env, PATH: await searchPath() });
}

export async function commandExists(command) {
  return Boolean(await findCommand(command));
}

async function firstExisting(commands) {
  const found = await Promise.all(commands.map(command => findCommand(command)));
  const index = found.findIndex(Boolean);
  return index === -1 ? null : { name: commands[index], path: found[index] };
}

function parseSemver(text) {
  const match = String(text || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: Number(match[1] || 0),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
    raw: match[0],
  };
}

function versionAtLeast(actual, required) {
  if (!required) return true;
  const a = typeof actual === 'string' ? parseSemver(actual) : actual;
  const r = typeof required === 'string' ? parseSemver(required) : required;
  if (!a || !r) return false;
  if (a.major !== r.major) return a.major > r.major;
  if (a.minor !== r.minor) return a.minor > r.minor;
  return a.patch >= r.patch;
}

function nodeVersionSupported(version) {
  const parsed = parseSemver(version);
  if (!parsed) return false;
  return (parsed.major === 22 && parsed.minor >= 13) || parsed.major >= 24;
}

async function versionFor(command, args = ['--version']) {
  const probe = await run(command, args);
  if (!probe.ok) return null;
  return parseSemver(probe.stdout)?.raw || probe.stdout.split(/\r?\n/)[0] || null;
}

function pythonCandidates() {
  if (isWin) return ['python', 'python3', 'py'];
  return [
    'python3',
    'python',
    '/opt/homebrew/opt/python@3.12/bin/python3.12',
    '/opt/homebrew/opt/python@3.11/bin/python3.11',
    '/usr/local/opt/python@3.12/bin/python3.12',
    '/usr/local/opt/python@3.11/bin/python3.11',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
  ];
}

function asyncatHome() {
  return runtimeHome();
}

function existingFile(candidates) {
  return candidates.find(candidate => {
    if (!candidate) return false;
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || null;
}

function whisperServerCandidates() {
  const home = os.homedir();
  const exe = isWin ? '.exe' : '';
  return [
    (process.env.WHISPER_BINARY_PATH || '').trim(),
    path.join(asyncatHome(), 'whisper.cpp', `whisper-server${exe}`),
    path.join(asyncatHome(), 'whisper.cpp', `main${exe}`),
    path.join(home, '.local', 'bin', 'whisper-server'),
    '/usr/local/bin/whisper-server',
    '/opt/homebrew/bin/whisper-server',
    '/usr/bin/whisper-server',
    path.join(home, 'whisper.cpp', 'build', 'bin', 'whisper-server'),
    path.join(home, 'whisper.cpp', 'server'),
  ].filter(Boolean);
}

function piperCandidates() {
  const home = os.homedir();
  const managedVenv = path.join(asyncatHome(), 'piper', 'python');
  return [
    (process.env.PIPER_BINARY_PATH || '').trim(),
    path.join(managedVenv, isWin ? 'Scripts' : 'bin', isWin ? 'piper.exe' : 'piper'),
    path.join(asyncatHome(), 'piper', 'piper'),
    path.join(home, '.local', 'bin', 'piper'),
    '/usr/local/bin/piper',
    '/opt/homebrew/bin/piper',
    '/usr/bin/piper',
    path.join(home, 'piper', 'piper'),
  ].filter(Boolean);
}

function sdCandidates() {
  const home = os.homedir();
  const exe = isWin ? '.exe' : '';
  const names = ['sd-cli', 'sd', 'stable-diffusion'];
  const roots = [
    path.join(asyncatHome(), 'stable-diffusion.cpp'),
    path.join(home, '.local', 'bin'),
    path.join(home, 'stable-diffusion.cpp', 'build', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
  ];
  const list = [(process.env.IMAGEGEN_BINARY_PATH || '').trim()];
  for (const root of roots) {
    for (const name of names) list.push(path.join(root, name + exe));
  }
  return list.filter(Boolean);
}

async function probePython(command) {
  const resolved = await findCommand(command);
  if (!resolved) return null;
  const [probe, venv, pip] = await Promise.all([
    run(resolved, ['--version']),
    run(resolved, ['-m', 'venv', '--help'], { timeout: 12000 }),
    run(resolved, ['-m', 'pip', '--version'], { timeout: 12000 }),
  ]);
  const version = parseSemver(probe.stdout);
  return {
    found: true,
    command,
    version: version?.raw || probe.stdout || null,
    ok: versionAtLeast(version, '3.10.0') && venv.ok && pip.ok,
    hasVenv: venv.ok,
    hasPip: pip.ok,
    minVersion: '3.10',
  };
}

export async function detectPython() {
  // All candidates at once; the first one (in order of preference) that works wins.
  const results = await Promise.all(pythonCandidates().map(probePython));
  return results.find(result => result?.ok)
    || results.find(Boolean)
    || {
      found: false,
      command: null,
      version: null,
      ok: false,
      hasVenv: false,
      hasPip: false,
      minVersion: '3.10',
    };
}

const PACKAGE_MANAGERS = {
  darwin: [['brew', 'brew', 'Homebrew']],
  linux: [
    ['apt', 'apt-get', 'APT'],
    ['dnf', 'dnf', 'DNF'],
    ['pacman', 'pacman', 'Pacman'],
    ['zypper', 'zypper', 'Zypper'],
    ['apk', 'apk', 'APK'],
    ['brew', 'brew', 'Homebrew on Linux'],
  ],
  win32: [
    ['winget', 'winget', 'Windows Package Manager'],
    ['choco', 'choco', 'Chocolatey'],
    ['scoop', 'scoop', 'Scoop'],
  ],
};

export async function detectPackageManagers() {
  const known = PACKAGE_MANAGERS[process.platform] || [];
  const found = await Promise.all(known.map(([, command]) => commandExists(command)));
  const managers = known
    .filter((_, index) => found[index])
    .map(([id, command, label]) => ({ id, command, label, available: true }));
  return {
    available: managers,
    preferred: managers[0] || null,
  };
}

async function compilerStatus() {
  const found = await firstExisting(isWin ? ['cl', 'clang++', 'g++'] : ['clang++', 'g++', 'c++']);
  return {
    found: Boolean(found),
    command: found?.name || null,
    path: found?.path || null,
    requiredFor: 'Compiling llama-cpp-python GPU runtimes from source',
  };
}

async function binaryCheck(name, commands, options = {}) {
  const onPath = await firstExisting(commands);
  const file = onPath ? null : existingFile(options.paths || []);
  const command = onPath?.name || file;
  const version = command ? await versionFor(onPath?.path || file, options.versionArgs || ['--version']) : null;
  return {
    id: name,
    found: Boolean(command),
    ok: Boolean(command),
    command,
    version,
    required: Boolean(options.required),
    scope: options.scope || 'optional',
    reason: options.reason || '',
    source: onPath ? 'PATH' : (file ? 'file' : null),
  };
}

function nodeCheck() {
  // If this report is running, this exact Node executable is already capable
  // of running the backend. Packaged desktop builds intentionally do not need
  // a second system Node on PATH.
  const command = process.execPath;
  const version = parseSemver(process.version)?.raw || process.version;
  return {
    id: 'node',
    found: Boolean(command),
    ok: Boolean(command) && nodeVersionSupported(version),
    command,
    version,
    minVersion: '22.13 / 24',
    required: true,
    scope: 'core',
    reason: isDesktopRuntime ? 'Bundled with the Asyncat desktop app.' : 'Runs the Asyncat backend.',
    source: isDesktopRuntime ? 'bundled' : 'process',
  };
}

function npmCheck() {
  return binaryCheck('npm', [isWin ? 'npm.cmd' : 'npm'], {
    required: !isDesktopRuntime,
    scope: isDesktopRuntime ? 'source-development' : 'core',
    reason: isDesktopRuntime ? 'Only needed for source development.' : 'Installs workspace packages.',
  });
}

async function mlxRuntimeCheck() {
  const supported = (process.platform === 'darwin' && process.arch === 'arm64')
    || (process.platform === 'linux' && ['x64', 'arm64'].includes(process.arch));
  if (!supported) {
    return {
      id: 'mlx-lm', found: false, ok: true, command: null, version: null,
      required: false, supported: false, scope: 'mlx',
      reason: 'MLX LM is supported on Apple Silicon and Linux (CPU or NVIDIA CUDA).',
    };
  }
  const candidates = [...new Set([
    (process.env.MLX_PYTHON_PATH || '').trim(),
    path.join(asyncatHome(), 'mlx', 'python', 'bin', 'python'),
    path.join(asyncatHome(), 'training', 'python', 'bin', 'python'),
    'python3',
  ].filter(Boolean))];
  const probes = await Promise.all(candidates.map(async (command) => {
    if (path.isAbsolute(command) && !fs.existsSync(command)) return false;
    return (await run(command, ['-c', 'import mlx_lm'], { timeout: 10000 })).ok;
  }));
  const index = probes.findIndex(Boolean);
  if (index !== -1) {
    return {
      id: 'mlx-lm', found: true, ok: true, command: candidates[index], version: null,
      required: false, supported: true, scope: 'mlx',
      reason: 'Runs MLX language models on Apple Silicon or Linux.',
    };
  }
  return {
    id: 'mlx-lm', found: false, ok: false, command: null, version: null,
    required: false, supported: true, scope: 'mlx',
    reason: 'Installable as an isolated managed runtime from Asyncat.',
  };
}

async function pythonCheck() {
  const python = await detectPython();
  return {
    id: 'python',
    found: python.found,
    ok: python.ok,
    command: python.command,
    version: python.version,
    minVersion: python.minVersion,
    required: false,
    scope: 'local-runtime',
    reason: 'Needed only for isolated managed Python environments such as Piper, llama-cpp-python, and MLX LM.',
    details: {
      hasVenv: python.hasVenv,
      hasPip: python.hasPip,
    },
  };
}

async function archiveChecks() {
  if (isWin) {
    return [
      {
        id: 'archive-tools',
        found: true,
        ok: true,
        command: 'PowerShell Expand-Archive',
        version: null,
        required: false,
        scope: 'managed-engine',
        reason: 'Windows uses PowerShell to extract llama.cpp zip assets.',
      },
    ];
  }
  return Promise.all([
    binaryCheck('tar', ['tar'], {
      scope: 'managed-engine',
      reason: 'Extracts tar/tgz llama.cpp release assets.',
    }),
    binaryCheck('unzip', ['unzip'], {
      scope: 'managed-engine',
      reason: 'Extracts zip llama.cpp release assets.',
    }),
  ]);
}

async function gpuStatus() {
  const [nvidia, rocm] = await Promise.all([commandExists('nvidia-smi'), commandExists('rocm-smi')]);
  if (nvidia) return { vendor: 'NVIDIA', command: 'nvidia-smi' };
  if (rocm) return { vendor: 'AMD', command: 'rocm-smi' };
  if (process.platform === 'darwin' && process.arch === 'arm64') return { vendor: 'Apple', command: 'system' };
  // Best-effort Intel GPU probe (checked last so a discrete NVIDIA/AMD wins).
  if (process.platform === 'linux') {
    const probe = await run('lspci', [], { timeout: 3000 });
    if (probe.ok && probe.stdout.split('\n').some(line => /vga|3d|display/i.test(line) && /intel/i.test(line))) {
      return { vendor: 'Intel', command: 'lspci' };
    }
  } else if (isWin) {
    const probe = await run('wmic', ['path', 'win32_VideoController', 'get', 'name'], { timeout: 4000 });
    if (probe.ok && /intel/i.test(probe.stdout)) return { vendor: 'Intel', command: 'wmic' };
  }
  return null;
}

async function buildReport() {
  const [
    npm,
    git,
    python,
    mlx,
    archives,
    ffmpeg,
    llamaServer,
    whisperServer,
    piper,
    sd,
    compiler,
    packageManagers,
    gpu,
  ] = await Promise.all([
    npmCheck(),
    binaryCheck('git', ['git'], {
      required: !isDesktopRuntime,
      scope: isDesktopRuntime ? 'source-development' : 'core',
      reason: isDesktopRuntime ? 'Only needed for source development.' : 'Clones and updates Asyncat.',
    }),
    pythonCheck(),
    mlxRuntimeCheck(),
    archiveChecks(),
    binaryCheck('ffmpeg', ['ffmpeg'], {
      scope: 'speech-to-text',
      reason: 'Audio conversion support for local Whisper workflows.',
    }),
    binaryCheck('llama-server', isWin ? ['llama-server.exe', 'llama-server'] : ['llama-server'], {
      scope: 'local-chat',
      reason: 'Optional if using Asyncat managed llama.cpp, llama-cpp-python, Ollama, LM Studio, or cloud providers.',
    }),
    binaryCheck('whisper-server', isWin ? ['whisper-server.exe', 'whisper-server'] : ['whisper-server'], {
      paths: whisperServerCandidates(),
      scope: 'speech-to-text',
      reason: 'Local Whisper STT runtime.',
    }),
    binaryCheck('piper', isWin ? ['piper.exe', 'piper'] : ['piper'], {
      paths: piperCandidates(),
      scope: 'text-to-speech',
      reason: 'Local Piper TTS runtime.',
    }),
    binaryCheck('sd', isWin ? ['sd.exe', 'sd-cli.exe', 'sd'] : ['sd', 'sd-cli', 'stable-diffusion'], {
      paths: sdCandidates(),
      scope: 'image-generation',
      reason: 'Local stable-diffusion.cpp image runtime.',
    }),
    compilerStatus(),
    detectPackageManagers(),
    gpuStatus(),
  ]);

  const checks = [nodeCheck(), npm, git, python, mlx, ...archives, ffmpeg, llamaServer, whisperServer, piper, sd];
  checks.push({
    id: 'cxx-compiler',
    found: compiler.found,
    ok: compiler.found,
    command: compiler.command,
    version: compiler.path ? await versionFor(compiler.path) : null,
    required: false,
    scope: 'gpu-build',
    reason: compiler.requiredFor,
  });

  const requiredMissing = checks.filter(check => check.required && !check.ok);
  const optionalMissing = checks.filter(check => (
    !check.required
    && !check.ok
    && !(isDesktopRuntime && check.scope === 'source-development')
  ));

  return {
    platform: process.platform,
    arch: process.arch,
    home: os.homedir(),
    packageManagers,
    gpu,
    checks,
    requiredMissing,
    optionalMissing,
    ready: requiredMissing.length === 0,
    commands: await recommendedInstallCommands(
      isDesktopRuntime ? checks.filter(check => check.scope !== 'source-development') : checks,
      packageManagers.preferred?.id,
      { managers: packageManagers.available },
    ),
  };
}

let cachedReport = null;
let cachedAt = 0;
let pendingReport = null;

/** Forget the cached report (after an install changed what is on this machine). */
export function invalidateSystemDependencyCache() {
  cachedReport = null;
  cachedAt = 0;
}

/**
 * The readiness report. Reused for a minute unless `refresh` is set; callers
 * arriving while it is being built share that one build.
 */
export async function inspectSystemDependencies({ refresh = false } = {}) {
  if (!refresh && cachedReport && Date.now() - cachedAt < REPORT_TTL_MS) return cachedReport;
  if (!pendingReport) {
    pendingReport = buildReport()
      .then((report) => {
        cachedReport = report;
        cachedAt = Date.now();
        return report;
      })
      .finally(() => {
        pendingReport = null;
      });
  }
  return pendingReport;
}

function packageSetsFor(manager) {
  const sets = {
    brew: {
      core: ['git', 'node'],
      python: ['python@3.12'],
      archive: ['unzip'],
      audio: ['ffmpeg', 'whisper-cpp'],
      build: ['cmake', 'ninja'],
      command: packages => `brew install ${packages.join(' ')}`,
      bootstrap: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
      compiler: 'xcode-select --install',
      packagesByCheck: {
        git: ['git'],
        node: ['node'],
        npm: ['node'],
        python: ['python@3.12'],
        unzip: ['unzip'],
        tar: [],
        ffmpeg: ['ffmpeg'],
        'whisper-server': ['whisper-cpp'],
        piper: [],
        'cxx-compiler': ['cmake', 'ninja'],
      },
    },
    apt: {
      core: ['git'],
      python: ['python3', 'python3-venv', 'python3-pip'],
      archive: ['unzip', 'tar'],
      audio: ['ffmpeg'],
      build: ['build-essential', 'cmake', 'ninja-build'],
      command: packages => `sudo apt-get update && sudo apt-get install -y ${packages.join(' ')}`,
      node: 'Install Node.js 20+ from https://nodejs.org, fnm, nvm, Volta, or NodeSource; distro nodejs packages may be older than Asyncat requires.',
      packagesByCheck: {
        git: ['git'],
        node: [],
        npm: [],
        python: ['python3', 'python3-venv', 'python3-pip'],
        unzip: ['unzip'],
        tar: ['tar'],
        ffmpeg: ['ffmpeg'],
        'whisper-server': [],
        piper: [],
        'cxx-compiler': ['build-essential', 'cmake', 'ninja-build'],
      },
    },
    dnf: {
      core: ['git'],
      python: ['python3', 'python3-pip'],
      archive: ['unzip', 'tar'],
      audio: ['ffmpeg'],
      build: ['gcc-c++', 'make', 'cmake', 'ninja-build'],
      command: packages => `sudo dnf install -y ${packages.join(' ')}`,
      node: 'sudo dnf install -y nodejs npm',
      packagesByCheck: {
        git: ['git'],
        node: ['nodejs', 'npm'],
        npm: ['nodejs', 'npm'],
        python: ['python3', 'python3-pip'],
        unzip: ['unzip'],
        tar: ['tar'],
        ffmpeg: ['ffmpeg'],
        'whisper-server': [],
        piper: [],
        'cxx-compiler': ['gcc-c++', 'make', 'cmake', 'ninja-build'],
      },
    },
    pacman: {
      core: ['git', 'nodejs', 'npm'],
      python: ['python', 'python-pip'],
      archive: ['unzip', 'tar'],
      audio: ['ffmpeg'],
      build: ['base-devel', 'cmake', 'ninja'],
      command: packages => `sudo pacman -S --needed ${packages.join(' ')}`,
      packagesByCheck: {
        git: ['git'],
        node: ['nodejs', 'npm'],
        npm: ['nodejs', 'npm'],
        python: ['python', 'python-pip'],
        unzip: ['unzip'],
        tar: ['tar'],
        ffmpeg: ['ffmpeg'],
        'whisper-server': [],
        piper: [],
        'cxx-compiler': ['base-devel', 'cmake', 'ninja'],
      },
    },
    zypper: {
      core: ['git', 'nodejs20', 'npm20'],
      python: ['python3', 'python3-pip'],
      archive: ['unzip', 'tar'],
      audio: ['ffmpeg'],
      build: ['gcc-c++', 'make', 'cmake', 'ninja'],
      command: packages => `sudo zypper install -y ${packages.join(' ')}`,
      packagesByCheck: {
        git: ['git'],
        node: ['nodejs20', 'npm20'],
        npm: ['nodejs20', 'npm20'],
        python: ['python3', 'python3-pip'],
        unzip: ['unzip'],
        tar: ['tar'],
        ffmpeg: ['ffmpeg'],
        'whisper-server': [],
        piper: [],
        'cxx-compiler': ['gcc-c++', 'make', 'cmake', 'ninja'],
      },
    },
    apk: {
      core: ['git', 'nodejs', 'npm'],
      python: ['python3', 'py3-pip'],
      archive: ['unzip', 'tar'],
      audio: ['ffmpeg'],
      build: ['build-base', 'cmake', 'ninja'],
      command: packages => `sudo apk add ${packages.join(' ')}`,
      packagesByCheck: {
        git: ['git'],
        node: ['nodejs', 'npm'],
        npm: ['nodejs', 'npm'],
        python: ['python3', 'py3-pip'],
        unzip: ['unzip'],
        tar: ['tar'],
        ffmpeg: ['ffmpeg'],
        'whisper-server': [],
        piper: [],
        'cxx-compiler': ['build-base', 'cmake', 'ninja'],
      },
    },
    winget: {
      core: ['Git.Git', 'OpenJS.NodeJS.LTS'],
      python: ['Python.Python.3.12'],
      archive: [],
      audio: ['Gyan.FFmpeg'],
      build: ['Kitware.CMake', 'Ninja-build.Ninja'],
      command: packages => packages.map(pkg => `winget install -e --id ${pkg}`).join(' && '),
      compiler: 'winget install -e --id Microsoft.VisualStudio.2022.BuildTools',
      packagesByCheck: {
        git: ['Git.Git'],
        node: ['OpenJS.NodeJS.LTS'],
        npm: ['OpenJS.NodeJS.LTS'],
        python: ['Python.Python.3.12'],
        'archive-tools': [],
        ffmpeg: ['Gyan.FFmpeg'],
        'whisper-server': [],
        piper: [],
        'cxx-compiler': ['Kitware.CMake', 'Ninja-build.Ninja'],
      },
    },
    choco: {
      core: ['git', 'nodejs-lts'],
      python: ['python312'],
      archive: ['unzip'],
      audio: ['ffmpeg'],
      build: ['cmake', 'ninja', 'visualstudio2022buildtools'],
      command: packages => `choco install -y ${packages.join(' ')}`,
      packagesByCheck: {
        git: ['git'],
        node: ['nodejs-lts'],
        npm: ['nodejs-lts'],
        python: ['python312'],
        unzip: ['unzip'],
        ffmpeg: ['ffmpeg'],
        'whisper-server': [],
        piper: [],
        'cxx-compiler': ['cmake', 'ninja', 'visualstudio2022buildtools'],
      },
    },
    scoop: {
      core: ['git', 'nodejs-lts'],
      python: ['python'],
      archive: ['unzip'],
      audio: ['ffmpeg'],
      build: ['cmake', 'ninja'],
      command: packages => `scoop install ${packages.join(' ')}`,
      packagesByCheck: {
        git: ['git'],
        node: ['nodejs-lts'],
        npm: ['nodejs-lts'],
        python: ['python'],
        unzip: ['unzip'],
        ffmpeg: ['ffmpeg'],
        'whisper-server': [],
        piper: [],
        'cxx-compiler': ['cmake', 'ninja'],
      },
    },
  };
  return sets[manager] || null;
}

/**
 * Package-manager commands for what is missing. `managers` is the list
 * detectPackageManagers() found (it is looked up when not given).
 */
export async function recommendedInstallCommands(checks, managerId = null, { managers: detected = null } = {}) {
  const detectedManagers = detected || (await detectPackageManagers()).available;
  const managers = managerId
    ? [{ id: managerId, command: detectedManagers.find(item => item.id === managerId)?.command || null }]
    : detectedManagers;
  const commands = [];

  for (const manager of managers) {
    const sets = packageSetsFor(manager.id);
    if (!sets) continue;
    const packages = [];
    for (const check of checks) {
      if (check.ok) continue;
      const byCheck = sets.packagesByCheck?.[check.id];
      if (byCheck) packages.push(...byCheck);
    }
    const uniquePackages = [...new Set(packages)];
    if (uniquePackages.length > 0) {
      commands.push({
        manager: manager.id,
        kind: 'packages',
        command: sets.command(uniquePackages),
        packages: uniquePackages,
      });
    }
    if (checks.some(check => !check.ok && (check.id === 'node' || check.id === 'npm')) && sets.node && !uniquePackages.some(pkg => /node/i.test(pkg))) {
      commands.push({ manager: manager.id, kind: 'node', command: sets.node });
    }
    if (checks.some(check => !check.ok && check.id === 'cxx-compiler') && sets.compiler) {
      commands.push({ manager: manager.id, kind: 'compiler', command: sets.compiler });
    }
    // Asked for a package manager this machine doesn't have: how to get it.
    if (!manager.command && sets.bootstrap) {
      commands.push({ manager: manager.id, kind: 'package-manager', command: sets.bootstrap });
    }
  }

  if (commands.length === 0) {
    commands.push({
      manager: 'manual',
      kind: 'manual',
      command: 'Install Node.js 20+, npm, git, Python 3.10+ with venv/pip, ffmpeg, unzip/tar, and C++ build tools using your OS package manager.',
    });
  }

  return commands;
}
