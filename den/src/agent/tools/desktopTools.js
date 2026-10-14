// den/src/agent/tools/desktopTools.js
// ─── Desktop Integration Tools ───────────────────────────────────────────────
// Tools that leverage the desktop environment:
//   clipboard_read    — read text from the system clipboard
//   clipboard_write   — write text to the system clipboard
//   reveal_in_finder  — reveal a file or folder in Finder / Explorer
//   app_open / app_list / active_app
//
// Uses OS programs to keep the backend process decoupled from Electron IPC.
// Every program runs with an argument list, never through a shell: text,
// paths and app names come from the model.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { childEnv } from '../childEnv.js';
import { PermissionLevel } from './toolRegistry.js';
import { IS_WIN, PLATFORM, hasBin, runFile, runPowerShell, runAppleScript, powerShellLiteral } from './shared.js';
import { sandboxCanChange } from '../sandboxFolders.js';

const isWayland = () => PLATFORM === 'linux' && Boolean(process.env.WAYLAND_DISPLAY);

// ── clipboard_read ────────────────────────────────────────────────────────────

export const clipboardReadTool = {
  name: 'clipboard_read',
  description: 'Read the current text content of the system clipboard. Useful for grabbing code, URLs, or data the user has copied.',
  category: 'desktop',
  // The clipboard often holds passwords and codes, so reading it asks first.
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute() {
    let res;
    if (PLATFORM === 'darwin') {
      res = runFile('pbpaste', [], { timeout: 5000 });
    } else if (IS_WIN) {
      res = runPowerShell('Get-Clipboard -Raw', { timeout: 5000 });
    } else if (isWayland() && hasBin('wl-paste')) {
      res = runFile('wl-paste', ['--no-newline'], { timeout: 5000 });
    } else if (hasBin('xclip')) {
      res = runFile('xclip', ['-selection', 'clipboard', '-o'], { timeout: 5000 });
    } else {
      res = runFile('xsel', ['--clipboard', '--output'], { timeout: 5000 });
    }
    return res.ok ? { success: true, text: res.stdout } : { success: false, error: res.error };
  },
};

// ── clipboard_write ───────────────────────────────────────────────────────────

export const clipboardWriteTool = {
  name: 'clipboard_write',
  description: 'Write text to the system clipboard so the user can paste it.',
  category: 'desktop',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to copy to clipboard.' },
    },
    required: ['text'],
  },
  async execute({ text }) {
    const input = String(text ?? '');
    let res;
    if (PLATFORM === 'darwin') {
      res = runFile('pbcopy', [], { input, timeout: 5000 });
    } else if (IS_WIN) {
      res = runPowerShell(`Set-Clipboard -Value ${powerShellLiteral(input)}`, { timeout: 5000 });
    } else if (isWayland() && hasBin('wl-copy')) {
      // wl-copy stays running to serve the clipboard, so don't wait for it.
      const child = spawn('wl-copy', [], { env: childEnv(), stdio: ['pipe', 'ignore', 'ignore'], detached: true });
      child.stdin.end(input);
      child.unref();
      return { success: true };
    } else if (hasBin('xclip')) {
      res = runFile('xclip', ['-selection', 'clipboard'], { input, timeout: 5000 });
    } else {
      res = runFile('xsel', ['--clipboard', '--input'], { input, timeout: 5000 });
    }
    return res.ok ? { success: true } : { success: false, error: res.error };
  },
};

// ── reveal_in_finder ─────────────────────────────────────────────────────────

export const revealInFinderTool = {
  name: 'reveal_in_finder',
  description: 'Reveal a file or folder in the system file manager (Finder on macOS, Explorer on Windows, Files on Linux). Opens the parent folder with the item selected.',
  category: 'desktop',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the file or folder to reveal.' },
    },
    required: ['path'],
  },
  async execute({ path: filePath }, context = {}) {
    const target = path.resolve(context.workingDir || process.cwd(), String(filePath ?? ''));
    if (!fs.existsSync(target)) return { success: false, error: `Not found: ${filePath}` };
    let res;
    if (PLATFORM === 'darwin') {
      res = runFile('open', ['-R', target], { timeout: 8000 });
    } else if (IS_WIN) {
      // explorer.exe exits with 1 even when it worked.
      res = runFile('explorer', [`/select,${target}`], { timeout: 8000 });
      res = { ...res, ok: res.status !== null };
    } else {
      res = runFile('xdg-open', [fs.statSync(target).isDirectory() ? target : path.dirname(target)], { timeout: 8000 });
    }
    return res.ok ? { success: true } : { success: false, error: res.error };
  },
};

// ── app_open ──────────────────────────────────────────────────────────────────
// app_open runs nothing in the command sandbox, so it opens apps and
// documents only. Where it starts a program by name (Linux), that program
// must be an installed desktop app: one with a .desktop entry that doesn't
// open in a terminal. A command-line program given a file from the project
// (m4, guile or uvx with a script saved as notes.txt) would otherwise run it
// outside the sandbox. Programs that run whatever they are given (shells,
// interpreters, terminals, launchers) are refused on every system, even with
// a desktop entry, and so is any file or bundle that runs code when opened,
// such as a script, a .desktop launcher or a .app.

const CODE_RUNNERS = new Set([
  // Shells, and programs that start another program.
  'sh', 'bash', 'rbash', 'zsh', 'fish', 'dash', 'ash', 'ksh', 'mksh', 'csh', 'tcsh', 'nu', 'xonsh', 'elvish', 'busybox', 'toybox',
  'env', 'sudo', 'doas', 'pkexec', 'su', 'runuser', 'nohup', 'setsid', 'nice', 'ionice', 'timeout', 'stdbuf', 'chroot', 'unshare',
  'nsenter', 'bwrap', 'firejail', 'systemd-run', 'flatpak-spawn', 'flatpak', 'xargs', 'watch', 'strace', 'ltrace', 'gdb', 'script', 'expect',
  'parallel', 'entr', 'watchexec', 'nodemon', 'at', 'batch', 'crontab', 'xdotool', 'ydotool', 'dbus-launch', 'dbus-run-session',
  'distrobox', 'distrobox-enter', 'toolbox', 'docker', 'podman', 'nix', 'nix-shell', 'guix', 'lldb', 'valgrind', 'time', 'taskset',
  'chrt', 'prlimit', 'proot', 'fakeroot', 'faketime',
  // Interpreters, runtimes and build tools.
  'python', 'pypy', 'py', 'pyw', 'ipython', 'node', 'nodejs', 'deno', 'bun', 'bunx', 'tsx', 'ts-node', 'npx', 'npm', 'pnpm', 'pnpx', 'yarn',
  'perl', 'ruby', 'irb', 'php', 'lua', 'luajit', 'tclsh', 'wish', 'java', 'javaw', 'jshell', 'groovy', 'scala', 'kotlin', 'julia', 'r',
  'rscript', 'swift', 'dotnet', 'mono', 'wine', 'wine64', 'osascript', 'awk', 'gawk', 'mawk', 'sed', 'make', 'gmake', 'cmake', 'ninja',
  'cargo', 'go', 'gcc', 'cc', 'clang',
  'm4', 'guile', 'uv', 'uvx', 'pip', 'pipx', 'poetry', 'pdm', 'hatch', 'rye', 'conda', 'mamba', 'micromamba', 'jupyter',
  'gnuplot', 'dc', 'bc', 'escript', 'erl', 'elixir', 'iex', 'mix', 'racket', 'raco', 'octave', 'octave-cli', 'matlab',
  'sbcl', 'clisp', 'ecl', 'ccl', 'chez', 'scheme', 'petite', 'csi', 'gsi', 'gst', 'ocaml', 'utop', 'ghc', 'ghci', 'runghc', 'runhaskell',
  'stack', 'cabal', 'tcc', 'nim', 'crystal', 'zig', 'dart', 'kotlinc', 'scala-cli', 'jbang', 'raku', 'rakudo', 'perl6', 'love', 'luvit',
  'fennel', 'janet', 'hy', 'sage', 'maxima', 'gp', 'gforth', 'pike', 'qjs', 'jrunscript', 'jjs', 'rhino', 'lli', 'jython', 'jruby',
  'just', 'task', 'rake', 'gradle', 'gradlew', 'mvn', 'ant', 'meson', 'scons', 'bazel', 'bazelisk', 'tox', 'nox', 'pytest',
  'ansible', 'ansible-playbook', 'terraform',
  // Windows.
  'cmd', 'powershell', 'pwsh', 'wscript', 'cscript', 'mshta', 'rundll32', 'regsvr32', 'msiexec', 'wsl', 'conhost', 'forfiles',
  'schtasks', 'certutil', 'bitsadmin', 'installutil', 'msbuild', 'regasm', 'regsvcs', 'wt', 'powershell_ise', 'hh',
  // Terminals, which run the file they are given.
  'terminal', 'iterm', 'xterm', 'uxterm', 'kitty', 'kitten', 'alacritty', 'foot', 'footclient', 'wezterm', 'wezterm-gui', 'konsole',
  'gnome-terminal', 'kgx', 'ptyxis', 'tilix', 'terminator', 'xfce4-terminal', 'lxterminal', 'mate-terminal', 'urxvt', 'rxvt', 'st',
  'sakura', 'terminology', 'qterminal', 'ghostty', 'warp', 'hyper', 'tabby', 'cool-retro-term', 'guake', 'yakuake', 'tmux', 'screen', 'ssh',
  'blackbox', 'contour', 'rio', 'tilda', 'deepin-terminal', 'cosmic-term', 'eterm', 'aterm', 'zellij', 'byobu',
  'script editor', 'automator', 'python launcher',
  // Openers: app_open already opens a file with its default app.
  'open', 'xdg-open', 'gio', 'gtk-launch', 'kioclient', 'kde-open', 'exo-open', 'start', 'handlr', 'mimeo', 'rifle', 'run-mailcap', 'see',
]);

// Files and bundles that run code when opened with their default app.
const RUNS_WHEN_OPENED = new Set([
  '.sh', '.bash', '.zsh', '.fish', '.ksh', '.csh', '.command', '.tool', '.desktop', '.app', '.appimage', '.run', '.bin',
  '.exe', '.com', '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.mjs', '.cjs', '.wsf', '.wsh', '.hta',
  '.msi', '.msp', '.msc', '.scr', '.pif', '.lnk', '.cpl', '.reg', '.jar', '.py', '.pyw', '.pyz', '.pl', '.rb', '.php', '.lua',
  '.tcl', '.scpt', '.applescript', '.workflow', '.action', '.terminal', '.url', '.webloc', '.inetloc', '.fileloc',
  '.deb', '.rpm', '.pkg', '.mpkg', '.dmg', '.flatpakref', '.snap',
]);

/**
 * The names a program goes by, without folder, extension or version:
 * "python3.12.exe" gives "python3.12.exe", "python3.12" and "python".
 * The name as given is kept too, so "m4" stays "m4".
 */
function programNames(app) {
  const base = String(app).split(/[\\/]/).pop().trim().toLowerCase();
  const bare = base.replace(/\.(exe|com|bat|cmd|app)$/, '');
  return [...new Set([base, bare, bare.replace(/[\d.-]+$/, '') || bare])];
}

/** The local file a target names (a path or a file: URL), or null for a web address. */
function localPath(target, workingDir) {
  const text = String(target || '').trim();
  if (!text) return null;
  if (/^file:/i.test(text)) {
    try { return fileURLToPath(text); } catch { return null; }
  }
  // Windows drive letters aside, "scheme:" is an address for its own app.
  if (/^[a-z][a-z0-9+.-]+:/i.test(text) && !/^[a-z]:[\\/]/i.test(text)) return null;
  return path.resolve(workingDir || process.cwd(), text.replace(/^~(?=$|[\\/])/, os.homedir()));
}

function runsWhenOpened(file, platform) {
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (RUNS_WHEN_OPENED.has(path.extname(file).toLowerCase())) return true;
  // A program file, which opening may start.
  return platform !== 'win32' && stat.isFile() && (stat.mode & 0o111) !== 0;
}

// ── Desktop apps (Linux) ──

/** Folders of .desktop entries: the XDG data folders, Flatpak's and Snap's. */
function applicationDirs(env = process.env, home = os.homedir()) {
  const dataHome = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  const dataDirs = String(env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter((dir) => path.isAbsolute(dir));
  const dirs = [dataHome, ...dataDirs, path.join(home, '.local/share/flatpak/exports/share'), '/var/lib/flatpak/exports/share', '/var/lib/snapd/desktop']
    .map((dir) => path.join(dir, 'applications'));
  // Not ones a sandboxed command can write to: an entry there would make any program an app.
  return [...new Set(dirs)].filter((dir) => !sandboxCanChange(dir));
}

/** The [Desktop Entry] keys app_open needs from a .desktop file. */
export function parseDesktopEntry(text) {
  const entry = {};
  let main = false;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      main = line === '[Desktop Entry]';
      continue;
    }
    const eq = line.indexOf('=');
    if (!main || eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (['Type', 'Name', 'Exec', 'Terminal', 'Hidden'].includes(key) && !(key in entry)) entry[key] = line.slice(eq + 1).trim();
  }
  return entry;
}

/**
 * The program an Exec line starts (env and its VAR=value skipped), when it
 * is the app itself: given only options and the file or address to open.
 * "python3 /opt/app/main.py" or "kitty -e htop" start something else, so
 * they don't make python3 or kitty a desktop app.
 */
function execProgram(exec) {
  const words = String(exec || '').match(/"(?:[^"\\]|\\.)*"|\S+/g) || [];
  let i = 0;
  if (words[i] === 'env' || /\/env$/.test(words[i] || '')) i += 1;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i += 1;
  const word = words[i];
  if (!word || !words.slice(i + 1).every((arg) => arg.startsWith('-') || /^%[a-zA-Z]$/.test(arg))) return null;
  return path.basename(word.replace(/^"|"$/g, '')).toLowerCase();
}

/** name → { id, terminal } for every installed desktop app, by entry name, program and shown name. */
export function desktopAppIndex(dirs = applicationDirs()) {
  const index = new Map();
  const add = (name, app) => {
    const key = String(name || '').trim().toLowerCase();
    if (key && !index.has(key)) index.set(key, app);
  };
  const files = [];
  for (const dir of dirs) {
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const item of names) {
      if (item.isDirectory()) {
        // Entries can sit one folder down (kde4/, for instance).
        try {
          for (const inner of fs.readdirSync(path.join(dir, item.name))) {
            if (inner.endsWith('.desktop')) files.push([`${item.name}-${inner}`, path.join(dir, item.name, inner)]);
          }
        } catch { /* unreadable */ }
      } else if (item.name.endsWith('.desktop')) {
        files.push([item.name, path.join(dir, item.name)]);
      }
    }
  }
  for (const [file, full] of files) {
    let entry;
    try { entry = parseDesktopEntry(fs.readFileSync(full, 'utf8')); } catch { continue; }
    if ((entry.Type && entry.Type !== 'Application') || entry.Hidden === 'true' || !entry.Exec) continue;
    const id = file.replace(/\.desktop$/, '');
    const app = { id, terminal: entry.Terminal === 'true' };
    const program = execProgram(entry.Exec);
    add(id, app);
    add(id.split('.').pop(), app);
    if (program && program !== 'flatpak') add(program, app);
    add(entry.Name, app);
  }
  return index;
}

let desktopApps = null;
/** The installed desktop app called `app` ({ id, terminal }), or null. Looked up again after a minute. */
function desktopAppFor(app) {
  if (!desktopApps || Date.now() - desktopApps.at > 60_000) desktopApps = { index: desktopAppIndex(), at: Date.now() };
  return desktopApps.index.get(String(app).trim().toLowerCase()) || null;
}

/** On Linux, app_open starts a program by name itself when it is on PATH; otherwise xdg-open opens the target. */
function startsByName(app, onPath = hasBin) {
  return !/[/\\:]/.test(app) && /^[\w.+-]+$/.test(app) && onPath(app);
}

/** The real file of the program `app` names on PATH (links followed), or null. */
function programFile(app, searchPath = process.env.PATH) {
  if (IS_WIN || /[/\\]/.test(String(app))) return null;
  for (const dir of String(searchPath || '').split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, String(app));
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate);
    } catch { /* not here */ }
  }
  return null;
}

/** Why app_open won't open this, or null. */
export function appOpenRefusal({
  app, file = null, workingDir = process.cwd(), platform = PLATFORM, onPath = hasBin, findDesktopApp = desktopAppFor, realProgram = programFile,
}) {
  const appName = String(app).trim();
  // The program as named, and the one that would really start ("nodejs" may be a link to node).
  const real = realProgram(appName);
  const names = [...programNames(appName), ...(real ? programNames(real) : [])];
  const runner = names.find((name) => CODE_RUNNERS.has(name)) || (CODE_RUNNERS.has(appName.toLowerCase()) ? appName.toLowerCase() : null);
  if (runner) {
    return `app_open opens apps and documents; it doesn't start ${runner}, which runs other programs or scripts. Use run_command for that (it runs in the sandbox).`;
  }
  if (platform === 'linux' && startsByName(appName, onPath)) {
    const desktopApp = findDesktopApp(appName) || (real ? findDesktopApp(path.basename(real)) : null);
    if (!desktopApp) {
      return `app_open starts desktop apps, and ${appName} isn't one (it has no .desktop entry), so it doesn't start it. Use run_command for command-line programs (it runs in the sandbox).`;
    }
    if (desktopApp.terminal) {
      return `app_open doesn't start ${appName}: it is a terminal program. Use run_command for it (it runs in the sandbox).`;
    }
  }
  const looksLikeTarget = /[/\\:]/.test(appName);
  for (const target of [file, looksLikeTarget ? appName : null]) {
    const local = target === null || target === undefined ? null : localPath(target, workingDir);
    if (local && runsWhenOpened(local, platform)) {
      return `app_open doesn't open ${path.basename(local)}: opening it would run it, outside the sandbox. Use run_command to run it, or ask the user to open it.`;
    }
  }
  return null;
}

export const appOpenTool = {
  name: 'app_open',
  description: 'Open an application by name, or open a file/URL with its default app. On macOS uses `open -a`, on Windows `Start-Process`, on Linux starts an installed desktop app by name or falls back to `xdg-open`. It won\'t start shells, interpreters, terminals or other command-line programs, or open files that run when opened (scripts, launchers, programs): use run_command for those.',
  category: 'desktop',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      app:  { type: 'string', description: 'Application name (e.g. "Safari", "Figma", "code") or a file/URL path to open with its default handler.' },
      file: { type: 'string', description: 'Optional file or URL to open inside the application.' },
    },
    required: ['app'],
  },
  async execute({ app, file }, context = {}) {
    const appName = String(app ?? '').trim();
    const target = file === undefined || file === null ? null : String(file);
    if (!appName) return { success: false, error: 'app is required' };
    const refusal = appOpenRefusal({ app: appName, file: target, workingDir: context.workingDir || process.cwd() });
    if (refusal) return { success: false, error: refusal };
    const looksLikeTarget = /[/\\:]/.test(appName);
    let res;
    if (PLATFORM === 'darwin') {
      res = looksLikeTarget
        ? runFile('open', [appName], { timeout: 8000 })
        : runFile('open', ['-a', appName, ...(target ? [target] : [])], { timeout: 8000 });
    } else if (IS_WIN) {
      const argList = target ? ` -ArgumentList ${powerShellLiteral(target)}` : '';
      res = runPowerShell(`Start-Process -FilePath ${powerShellLiteral(appName)}${argList}`, { timeout: 8000 });
    } else if (startsByName(appName)) {
      // A desktop app (appOpenRefusal checked). Launch detached so the app outlives this request.
      const child = spawn(appName, target ? [target] : [], { env: childEnv(), detached: true, stdio: 'ignore' });
      child.on('error', () => {});
      child.unref();
      return { success: true };
    } else {
      res = runFile('xdg-open', [target || appName], { timeout: 8000 });
    }
    return res.ok ? { success: true } : { success: false, error: res.error };
  },
};

// ── app_list ──────────────────────────────────────────────────────────────────

function desktopEntryNames(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith('.desktop'))
      .map((name) => {
        try {
          const line = fs.readFileSync(path.join(dir, name), 'utf8').split('\n').find((l) => l.startsWith('Name='));
          return line ? line.slice(5).trim() : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export const appListTool = {
  name: 'app_list',
  description: 'List installed applications on the system. Useful for finding the correct app name before calling app_open.',
  category: 'desktop',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string', description: 'Optional case-insensitive substring to filter results (e.g. "code" returns VS Code, Xcode, etc.).' },
    },
    required: [],
  },
  async execute({ filter } = {}) {
    try {
      let apps = [];
      if (PLATFORM === 'darwin') {
        for (const dir of ['/Applications', path.join(os.homedir(), 'Applications')]) {
          try {
            apps.push(...fs.readdirSync(dir).filter((e) => e.endsWith('.app')).map((e) => e.replace(/\.app$/, '')));
          } catch { /* dir may not exist */ }
        }
      } else if (IS_WIN) {
        const res = runPowerShell('Get-StartApps | Select-Object -ExpandProperty Name', { timeout: 10000 });
        apps = res.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
      } else {
        apps = [
          ...desktopEntryNames('/usr/share/applications'),
          ...desktopEntryNames(path.join(os.homedir(), '.local/share/applications')),
        ];
      }
      if (filter) {
        const lc = String(filter).toLowerCase();
        apps = apps.filter((a) => a.toLowerCase().includes(lc));
      }
      apps = [...new Set(apps)].sort();
      return { success: true, apps, count: apps.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── active_app ────────────────────────────────────────────────────────────────

export const activeAppTool = {
  name: 'active_app',
  description: 'Return the name of the currently focused (frontmost) application.',
  category: 'desktop',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute() {
    let name = '';
    if (PLATFORM === 'darwin') {
      name = runAppleScript('tell application "System Events" to get name of first process whose frontmost is true', { timeout: 5000 }).stdout.trim();
    } else if (IS_WIN) {
      name = runPowerShell([
        "Add-Type -MemberDefinition '[DllImport(''user32.dll'')] public static extern IntPtr GetForegroundWindow();' -Name Win32 -Namespace WinAPI",
        '(Get-Process | Where-Object { $_.MainWindowHandle -eq [WinAPI.Win32]::GetForegroundWindow() }).Name',
      ].join('; '), { timeout: 5000 }).stdout.trim();
    } else if (isWayland() && hasBin('hyprctl')) {
      try {
        const win = JSON.parse(runFile('hyprctl', ['activewindow', '-j'], { timeout: 3000 }).stdout || '{}');
        name = win.class || win.title || '';
      } catch { name = ''; }
    } else if (hasBin('xdotool')) {
      name = runFile('xdotool', ['getactivewindow', 'getwindowname'], { timeout: 3000 }).stdout.trim();
    }
    return name ? { success: true, name } : { success: false, error: 'Could not find the focused application on this desktop.' };
  },
};


export const desktopTools = [clipboardReadTool, clipboardWriteTool, revealInFinderTool, appOpenTool, appListTool, activeAppTool];
