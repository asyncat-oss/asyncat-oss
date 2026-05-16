import os from 'os';
import { execFileSync, execSync } from 'child_process';

const isWin = process.platform === 'win32';

function run(cmd, args = [], options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(cmd, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: options.timeout || 8000,
        windowsHide: true,
        ...options,
      }).trim(),
    };
  } catch (error) {
    return { ok: false, stdout: '', error: error.message };
  }
}

function shell(command, options = {}) {
  try {
    return {
      ok: true,
      stdout: execSync(command, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: options.timeout || 8000,
        windowsHide: true,
        ...options,
      }).trim(),
    };
  } catch (error) {
    return { ok: false, stdout: '', error: error.message };
  }
}

export function commandExists(command) {
  if (!command) return false;
  const probe = isWin ? run('where', [command]) : run('sh', ['-lc', `command -v ${quoteShell(command)}`]);
  return probe.ok && Boolean(probe.stdout);
}

function quoteShell(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function firstExisting(commands) {
  return commands.find(commandExists) || null;
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

function versionFor(command, args = ['--version']) {
  const probe = run(command, args);
  if (!probe.ok) return null;
  return parseSemver(probe.stdout)?.raw || probe.stdout.split(/\r?\n/)[0] || null;
}

function pythonCandidates() {
  return isWin ? ['python', 'python3', 'py'] : ['python3', 'python'];
}

export function detectPython() {
  for (const command of pythonCandidates()) {
    if (!commandExists(command)) continue;
    const probe = run(command, ['--version']);
    const version = parseSemver(probe.stdout);
    const hasVenv = run(command, ['-m', 'venv', '--help'], { timeout: 12000 }).ok;
    const hasPip = run(command, ['-m', 'pip', '--version'], { timeout: 12000 }).ok;
    return {
      found: true,
      command,
      version: version?.raw || probe.stdout || null,
      ok: versionAtLeast(version, '3.10.0') && hasVenv && hasPip,
      hasVenv,
      hasPip,
      minVersion: '3.10',
    };
  }
  return {
    found: false,
    command: null,
    version: null,
    ok: false,
    hasVenv: false,
    hasPip: false,
    minVersion: '3.10',
  };
}

export function detectPackageManagers() {
  const managers = [];
  const add = (id, command, label) => {
    if (commandExists(command)) managers.push({ id, command, label, available: true });
  };

  if (process.platform === 'darwin') {
    add('brew', 'brew', 'Homebrew');
  } else if (process.platform === 'linux') {
    add('apt', 'apt-get', 'APT');
    add('dnf', 'dnf', 'DNF');
    add('pacman', 'pacman', 'Pacman');
    add('zypper', 'zypper', 'Zypper');
    add('apk', 'apk', 'APK');
    add('brew', 'brew', 'Homebrew on Linux');
  } else if (isWin) {
    add('winget', 'winget', 'Windows Package Manager');
    add('choco', 'choco', 'Chocolatey');
    add('scoop', 'scoop', 'Scoop');
  }

  return {
    available: managers,
    preferred: managers[0] || null,
  };
}

function compilerStatus() {
  const command = isWin ? firstExisting(['cl', 'clang++', 'g++']) : firstExisting(['clang++', 'g++', 'c++']);
  return {
    found: Boolean(command),
    command,
    requiredFor: 'Compiling llama-cpp-python GPU runtimes from source',
  };
}

function binaryCheck(name, commands, options = {}) {
  const command = firstExisting(commands);
  const version = command ? versionFor(command, options.versionArgs || ['--version']) : null;
  return {
    id: name,
    found: Boolean(command),
    ok: Boolean(command),
    command,
    version,
    required: Boolean(options.required),
    scope: options.scope || 'optional',
    reason: options.reason || '',
  };
}

function nodeCheck() {
  const command = firstExisting(['node']);
  const version = command ? versionFor(command) : null;
  return {
    id: 'node',
    found: Boolean(command),
    ok: Boolean(command) && versionAtLeast(version, '20.0.0'),
    command,
    version,
    minVersion: '20',
    required: true,
    scope: 'core',
    reason: 'Runs the Asyncat backend, frontend tooling, and CLI.',
  };
}

function npmCheck() {
  return binaryCheck('npm', [isWin ? 'npm.cmd' : 'npm'], {
    required: true,
    scope: 'core',
    reason: 'Installs workspace packages.',
  });
}

function pythonCheck() {
  const python = detectPython();
  return {
    id: 'python',
    found: python.found,
    ok: python.ok,
    command: python.command,
    version: python.version,
    minVersion: python.minVersion,
    required: false,
    scope: 'local-runtime',
    reason: 'Needed only for managed Python venvs: llama-cpp-python fallback/GPU builds and MLX on Apple Silicon.',
    details: {
      hasVenv: python.hasVenv,
      hasPip: python.hasPip,
    },
  };
}

function archiveChecks() {
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
  return [
    binaryCheck('tar', ['tar'], {
      scope: 'managed-engine',
      reason: 'Extracts tar/tgz llama.cpp release assets.',
    }),
    binaryCheck('unzip', ['unzip'], {
      scope: 'managed-engine',
      reason: 'Extracts zip llama.cpp release assets.',
    }),
  ];
}

function gpuStatus() {
  if (commandExists('nvidia-smi')) return { vendor: 'NVIDIA', command: 'nvidia-smi' };
  if (commandExists('rocm-smi')) return { vendor: 'AMD', command: 'rocm-smi' };
  if (process.platform === 'darwin' && process.arch === 'arm64') return { vendor: 'Apple', command: 'system' };
  return null;
}

export function inspectSystemDependencies() {
  const checks = [
    nodeCheck(),
    npmCheck(),
    binaryCheck('git', ['git'], {
      required: true,
      scope: 'core',
      reason: 'Clones and updates Asyncat.',
    }),
    pythonCheck(),
    ...archiveChecks(),
    binaryCheck('ffmpeg', ['ffmpeg'], {
      scope: 'speech-to-text',
      reason: 'Audio conversion support for local Whisper workflows.',
    }),
    binaryCheck('llama-server', isWin ? ['llama-server.exe', 'llama-server'] : ['llama-server'], {
      scope: 'local-chat',
      reason: 'Optional if using Asyncat managed llama.cpp, llama-cpp-python, Ollama, LM Studio, or cloud providers.',
    }),
    binaryCheck('whisper-server', ['whisper-server'], {
      scope: 'speech-to-text',
      reason: 'Local Whisper STT runtime.',
    }),
    binaryCheck('piper', ['piper'], {
      scope: 'text-to-speech',
      reason: 'Local Piper TTS runtime.',
    }),
  ];

  const compiler = compilerStatus();
  checks.push({
    id: 'cxx-compiler',
    found: compiler.found,
    ok: compiler.found,
    command: compiler.command,
    version: compiler.command ? versionFor(compiler.command) : null,
    required: false,
    scope: 'gpu-build',
    reason: compiler.requiredFor,
  });

  const requiredMissing = checks.filter(check => check.required && !check.ok);
  const optionalMissing = checks.filter(check => !check.required && !check.ok);
  const packageManagers = detectPackageManagers();

  return {
    platform: process.platform,
    arch: process.arch,
    home: os.homedir(),
    packageManagers,
    gpu: gpuStatus(),
    checks,
    requiredMissing,
    optionalMissing,
    ready: requiredMissing.length === 0,
    commands: recommendedInstallCommands(checks, packageManagers.preferred?.id),
  };
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

export function recommendedInstallCommands(checks, managerId = null) {
  const detectedManagers = detectPackageManagers().available;
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
    if (manager.command && !commandExists(manager.command) && sets.bootstrap) {
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

export function installSystemPackages({ managerId = null, includeOptional = true, dryRun = false } = {}) {
  const report = inspectSystemDependencies();
  const manager = managerId || report.packageManagers.preferred?.id;
  if (!manager) {
    return { ok: false, error: 'No supported package manager detected.', report };
  }
  const checks = includeOptional ? report.checks : report.checks.filter(check => check.required);
  const command = recommendedInstallCommands(checks, manager)[0]?.command;
  if (!command || command.includes('Install Node.js 20+ from')) {
    return { ok: false, error: 'No direct package-manager command is available for this platform.', command, report };
  }
  if (dryRun) return { ok: true, dryRun: true, command, report };
  const result = shell(command, { stdio: 'inherit', timeout: 20 * 60 * 1000 });
  return { ok: result.ok, command, error: result.error || null, report: inspectSystemDependencies() };
}
