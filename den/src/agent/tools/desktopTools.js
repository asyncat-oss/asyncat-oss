// den/src/agent/tools/desktopTools.js
// ─── Desktop Integration Tools ───────────────────────────────────────────────
// Tools that leverage the Electron desktop environment:
//   clipboard_read    — read text from the system clipboard
//   clipboard_write   — write text to the system clipboard
//   reveal_in_finder  — reveal a file or folder in Finder / Explorer
//
// Uses OS commands to keep the backend process decoupled from Electron IPC.

import { execSync } from 'child_process';
import { PermissionLevel } from './toolRegistry.js';
import { IS_WIN, PLATFORM } from './shared.js';

// ── clipboard_read ────────────────────────────────────────────────────────────

export const clipboardReadTool = {
  name: 'clipboard_read',
  description: 'Read the current text content of the system clipboard. Useful for grabbing code, URLs, or data the user has copied.',
  category: 'desktop',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute() {
    try {
      let text;
      if (PLATFORM === 'darwin') {
        text = execSync('pbpaste', { encoding: 'utf8' });
      } else if (IS_WIN) {
        text = execSync('powershell.exe -command "Get-Clipboard"', { encoding: 'utf8' });
      } else {
        // Linux — try xclip, fall back to xsel
        try {
          text = execSync('xclip -selection clipboard -o', { encoding: 'utf8' });
        } catch {
          text = execSync('xsel --clipboard --output', { encoding: 'utf8' });
        }
      }
      return { success: true, text: text ?? '' };
    } catch (err) {
      return { success: false, error: err.message };
    }
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
    try {
      if (PLATFORM === 'darwin') {
        execSync(`echo ${JSON.stringify(text)} | pbcopy`);
      } else if (IS_WIN) {
        execSync(`powershell.exe -command "Set-Clipboard -Value ${JSON.stringify(text)}"`);
      } else {
        try {
          execSync(`echo ${JSON.stringify(text)} | xclip -selection clipboard`);
        } catch {
          execSync(`echo ${JSON.stringify(text)} | xsel --clipboard --input`);
        }
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
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
  async execute({ path: filePath }) {
    try {
      if (PLATFORM === 'darwin') {
        execSync(`open -R ${JSON.stringify(filePath)}`);
      } else if (IS_WIN) {
        execSync(`explorer /select,${JSON.stringify(filePath)}`);
      } else {
        // Linux — open the parent directory
        const parent = filePath.replace(/\/[^/]+$/, '') || '/';
        execSync(`xdg-open ${JSON.stringify(parent)}`);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
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
    try {
      if (PLATFORM === 'darwin') {
        const target = file ? `${JSON.stringify(app)} ${JSON.stringify(file)}` : `-a ${JSON.stringify(app)}`;
        execSync(`open ${target}`, { timeout: 8000 });
      } else if (IS_WIN) {
        const args = file ? `${JSON.stringify(app)}, ${JSON.stringify(file)}` : JSON.stringify(app);
        execSync(`powershell.exe -command "Start-Process ${args}"`, { timeout: 8000 });
      } else {
        // Linux — try launching directly, fall back to xdg-open
        try {
          execSync(`${JSON.stringify(app)} ${file ? JSON.stringify(file) : ''} &`, { timeout: 5000 });
        } catch {
          execSync(`xdg-open ${JSON.stringify(file || app)}`, { timeout: 5000 });
        }
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── app_list ──────────────────────────────────────────────────────────────────

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
        const dirs = ['/Applications', `${process.env.HOME}/Applications`];
        for (const dir of dirs) {
          try {
            const out = execSync(`ls "${dir}"`, { encoding: 'utf8', timeout: 5000 });
            const entries = out.split('\n').filter(e => e.endsWith('.app')).map(e => e.replace(/\.app$/, ''));
            apps.push(...entries);
          } catch { /* dir may not exist */ }
        }
      } else if (IS_WIN) {
        const out = execSync(
          `powershell.exe -command "Get-StartApps | Select-Object -ExpandProperty Name"`,
          { encoding: 'utf8', timeout: 10000 }
        );
        apps = out.split('\n').map(l => l.trim()).filter(Boolean);
      } else {
        // Linux — parse .desktop files for app names
        const out = execSync(
          `grep -rh "^Name=" /usr/share/applications ~/.local/share/applications 2>/dev/null | sed 's/^Name=//' | sort -u`,
          { encoding: 'utf8', timeout: 8000 }
        );
        apps = out.split('\n').map(l => l.trim()).filter(Boolean);
      }
      if (filter) {
        const lc = filter.toLowerCase();
        apps = apps.filter(a => a.toLowerCase().includes(lc));
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
    try {
      let name;
      if (PLATFORM === 'darwin') {
        name = execSync(
          `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
          { encoding: 'utf8', timeout: 5000 }
        ).trim();
      } else if (IS_WIN) {
        name = execSync(
          `powershell.exe -command "(Get-Process | Where-Object {$_.MainWindowHandle -eq (Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();' -Name 'Win32' -Namespace 'WinAPI' -PassThru)::GetForegroundWindow()}).Name"`,
          { encoding: 'utf8', timeout: 5000 }
        ).trim();
      } else {
        // Linux — try xdotool, fall back to xprop
        try {
          name = execSync(
            `xdotool getactivewindow getwindowname`,
            { encoding: 'utf8', timeout: 3000 }
          ).trim();
        } catch {
          name = execSync(
            `xprop -id $(xprop -root _NET_ACTIVE_WINDOW | awk '{print $5}') WM_NAME | cut -d '"' -f 2`,
            { encoding: 'utf8', timeout: 3000 }
          ).trim();
        }
      }
      return { success: true, name };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const desktopTools = [clipboardReadTool, clipboardWriteTool, revealInFinderTool, appOpenTool, appListTool, activeAppTool];
