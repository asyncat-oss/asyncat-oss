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
import { childEnv } from '../childEnv.js';
import { PermissionLevel } from './toolRegistry.js';
import { IS_WIN, PLATFORM, hasBin, runFile, runPowerShell, runAppleScript, powerShellLiteral } from './shared.js';

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

export const appOpenTool = {
  name: 'app_open',
  description: 'Open an application by name, or open a file/URL with its default app. On macOS uses `open -a`, on Windows `Start-Process`, on Linux tries the app name directly then falls back to `xdg-open`.',
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
  async execute({ app, file }) {
    const appName = String(app ?? '').trim();
    const target = file === undefined || file === null ? null : String(file);
    if (!appName) return { success: false, error: 'app is required' };
    const looksLikeTarget = /[/\\:]/.test(appName);
    let res;
    if (PLATFORM === 'darwin') {
      res = looksLikeTarget
        ? runFile('open', [appName], { timeout: 8000 })
        : runFile('open', ['-a', appName, ...(target ? [target] : [])], { timeout: 8000 });
    } else if (IS_WIN) {
      const argList = target ? ` -ArgumentList ${powerShellLiteral(target)}` : '';
      res = runPowerShell(`Start-Process -FilePath ${powerShellLiteral(appName)}${argList}`, { timeout: 8000 });
    } else if (!looksLikeTarget && /^[\w.+-]+$/.test(appName) && hasBin(appName)) {
      // Launch detached so the app outlives this request.
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
