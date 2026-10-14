// den/src/agent/tools/screenTools.js
// ─── Screen Controller Tools ─────────────────────────────────────────────────
// Lets the agent see and interact with the desktop:
//   take_screenshot  — captures the full screen or a window as PNG
//   screen_click     — moves mouse and clicks at x,y
//   screen_type      — types text via keyboard
//   screen_read      — runs OCR on a screenshot (text extraction)
//
// Linux, Wayland: grim for screenshots, hyprctl on Hyprland for windows,
//   wtype for typing and ydotool for clicks when installed.
// Linux, X11: scrot/gnome-screenshot/ImageMagick + xdotool.
// macOS: screencapture + cliclick + osascript.
// Windows: built-in PowerShell.
//
// Every program runs with an argument list, never through a shell: window
// titles and typed text come from the model.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { PermissionLevel } from './toolRegistry.js';
import {
  hasBin, IS_WIN, PLATFORM, missingDepError, runFile, runPowerShell, runAppleScript,
  powerShellLiteral, appleScriptLiteral,
} from './shared.js';

const TMP_DIR = path.join(os.tmpdir(), 'asyncat-screen');
fs.mkdirSync(TMP_DIR, { recursive: true });

const isWayland = () => PLATFORM === 'linux' && Boolean(process.env.WAYLAND_DISPLAY);
const isHyprland = () => isWayland() && Boolean(process.env.HYPRLAND_INSTANCE_SIGNATURE) && hasBin('hyprctl');

function coord(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : null;
}

function hyprClients() {
  const res = runFile('hyprctl', ['clients', '-j'], { timeout: 3000 });
  if (!res.ok) return [];
  try {
    return JSON.parse(res.stdout).filter((c) => c.mapped !== false);
  } catch {
    return [];
  }
}

function matchesTitle(client, pattern) {
  const needle = String(pattern || '').toLowerCase();
  return `${client.title || ''} ${client.class || ''}`.toLowerCase().includes(needle);
}

function fail(result, fallback) {
  return { success: false, error: result?.error || fallback };
}

// ── take_screenshot ───────────────────────────────────────────────────────────
export const takeScreenshotTool = {
  name: 'take_screenshot',
  description: 'Capture the current screen or a specific window as a PNG image. Returns the file path. Use before screen_read or to observe UI state.',
  category: 'screen',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      window_title: { type: 'string', description: 'Capture only this window (partial match). If omitted, captures full screen.' },
      output_name:  { type: 'string', description: 'Optional filename (e.g. "login.png"). Defaults to timestamped name.' },
    },
    required: [],
  },
  execute: async (args) => {
    const fname = path.basename(String(args.output_name || `screen_${Date.now()}.png`));
    const outPath = path.join(TMP_DIR, fname.endsWith('.png') ? fname : `${fname}.png`);

    try {
      let res;
      if (isWayland()) {
        if (!hasBin('grim')) return missingDepError('grim', 'Install grim for screenshots on Wayland (e.g. sudo pacman -S grim).');
        const geometry = [];
        if (args.window_title && isHyprland()) {
          const client = hyprClients().find((c) => matchesTitle(c, args.window_title));
          if (!client) return { success: false, error: `No window found for: ${args.window_title}` };
          const [x, y] = client.at;
          const [w, h] = client.size;
          geometry.push('-g', `${x},${y} ${w}x${h}`);
        }
        res = runFile('grim', [...geometry, outPath], { timeout: 8000 });
      } else if (PLATFORM === 'linux') {
        if (args.window_title && hasBin('xdotool')) {
          runFile('xdotool', ['search', '--name', String(args.window_title), 'windowfocus', '--sync'], { timeout: 5000 });
        }
        if (hasBin('scrot')) {
          res = runFile('scrot', args.window_title ? ['--focused', '--delay', '0', outPath] : [outPath], { timeout: 8000 });
        } else if (hasBin('gnome-screenshot')) {
          res = runFile('gnome-screenshot', ['-f', outPath], { timeout: 8000 });
        } else if (hasBin('import')) {
          res = runFile('import', ['-window', 'root', outPath], { timeout: 8000 });
        } else {
          return { success: false, error: 'No screenshot tool found. Install scrot (X11) or grim (Wayland).' };
        }
      } else if (PLATFORM === 'darwin') {
        res = runFile('screencapture', ['-x', outPath], { timeout: 8000 });
      } else if (IS_WIN) {
        res = runPowerShell([
          'Add-Type -AssemblyName System.Windows.Forms',
          'Add-Type -AssemblyName System.Drawing',
          '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
          '$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)',
          '$gfx = [System.Drawing.Graphics]::FromImage($bmp)',
          '$gfx.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)',
          `$bmp.Save(${powerShellLiteral(outPath)})`,
          '$gfx.Dispose(); $bmp.Dispose()',
        ].join('; '), { timeout: 15000 });
      } else {
        return missingDepError('screenshot tool', 'Linux: grim or scrot | macOS: built-in screencapture | Windows: built-in PowerShell');
      }

      if (!fs.existsSync(outPath)) {
        return fail(res, 'Screenshot file not created. Check the display environment.');
      }
      const stat = fs.statSync(outPath);
      return {
        success: true,
        path: outPath,
        size_bytes: stat.size,
        size_kb: Math.round(stat.size / 1024),
        note: 'Use screen_read to extract text from this screenshot.',
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── screen_read (OCR) ─────────────────────────────────────────────────────────
export const screenReadTool = {
  name: 'screen_read',
  description: 'Extract text from a screenshot using OCR (tesseract). Call take_screenshot first and pass the path it returned.',
  category: 'screen',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      image_path: { type: 'string', description: 'Path to the PNG/JPEG to read. Use the path returned by take_screenshot.' },
    },
    required: ['image_path'],
  },
  execute: async (args, context = {}) => {
    const imgPath = path.resolve(context.workingDir || TMP_DIR, String(args.image_path || ''));
    // OCR is a way to read files, so only screenshots and project files.
    const allowedRoots = [TMP_DIR, context.workingDir].filter(Boolean).map((root) => path.resolve(root));
    if (!allowedRoots.some((root) => imgPath === root || imgPath.startsWith(root + path.sep))) {
      return { success: false, error: 'screen_read only reads screenshots from take_screenshot or images inside the project folder.' };
    }
    if (!fs.existsSync(imgPath)) {
      return { success: false, error: `File not found: ${args.image_path}` };
    }
    if (!hasBin('tesseract')) {
      return missingDepError('tesseract', 'macOS: brew install tesseract | Linux: install tesseract | Windows: https://github.com/UB-Mannheim/tesseract/wiki');
    }
    const outBase = path.join(TMP_DIR, `ocr_${Date.now()}`);
    const res = runFile('tesseract', [imgPath, outBase], { timeout: 15000 });
    const txtPath = `${outBase}.txt`;
    if (!fs.existsSync(txtPath)) return fail(res, 'OCR produced no text file.');
    const text = fs.readFileSync(txtPath, 'utf8').trim();
    try { fs.unlinkSync(txtPath); } catch {}
    return { success: true, text: text.slice(0, 8000), chars: text.length };
  },
};

// ── screen_click ──────────────────────────────────────────────────────────────
export const screenClickTool = {
  name: 'screen_click',
  description: 'Move the mouse to screen coordinates (x, y) and click. Supports left, right, and double clicks. Use after take_screenshot to identify coordinates.',
  category: 'screen',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      x:      { type: 'number', description: 'X coordinate in pixels from top-left' },
      y:      { type: 'number', description: 'Y coordinate in pixels from top-left' },
      button: { type: 'string', enum: ['left', 'right', 'double'], description: 'Which button to click (default: left)' },
    },
    required: ['x', 'y'],
  },
  execute: async (args) => {
    const x = coord(args.x);
    const y = coord(args.y);
    if (x === null || y === null) return { success: false, error: 'x and y must be numbers.' };
    const button = ['left', 'right', 'double'].includes(args.button) ? args.button : 'left';

    let res;
    if (isWayland()) {
      if (!hasBin('ydotool')) return missingDepError('ydotool', 'Clicking on Wayland needs ydotool and its ydotoold service.');
      const code = button === 'right' ? '0xC1' : '0xC0';
      res = runFile('ydotool', ['mousemove', '--absolute', '-x', x, '-y', y], { timeout: 5000 });
      if (res.ok) res = runFile('ydotool', ['click', ...(button === 'double' ? ['--repeat', '2'] : []), code], { timeout: 5000 });
    } else if (PLATFORM === 'linux') {
      if (!hasBin('xdotool')) return missingDepError('xdotool', 'Install xdotool (X11).');
      const clicks = button === 'double' ? ['click', '--repeat', '2', '1'] : ['click', button === 'right' ? '3' : '1'];
      res = runFile('xdotool', ['mousemove', x, y, ...clicks], { timeout: 5000 });
    } else if (PLATFORM === 'darwin') {
      if (!hasBin('cliclick')) return missingDepError('cliclick', 'brew install cliclick');
      const action = button === 'double' ? 'dc' : button === 'right' ? 'rc' : 'c';
      res = runFile('cliclick', [`${action}:${x},${y}`], { timeout: 5000 });
    } else if (IS_WIN) {
      const [down, up] = button === 'right' ? ['0x0008', '0x0010'] : ['0x0002', '0x0004'];
      const times = button === 'double' ? 2 : 1;
      res = runPowerShell([
        'Add-Type -AssemblyName System.Windows.Forms',
        // No double quotes: they would need escaping on the Windows command line.
        "Add-Type -MemberDefinition '[DllImport(''user32.dll'')] public static extern void mouse_event(int f, int x, int y, int d, int e);' -Name M -Namespace W",
        `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`,
        `1..${times} | ForEach-Object { [W.M]::mouse_event(${down}, 0, 0, 0, 0); [W.M]::mouse_event(${up}, 0, 0, 0, 0); Start-Sleep -Milliseconds 60 }`,
      ].join('; '), { timeout: 10000 });
    } else {
      return missingDepError('screen click tool', 'Linux: xdotool or ydotool | macOS: cliclick | Windows: built-in PowerShell');
    }
    return res.ok ? { success: true, x, y, button } : fail(res, 'Click failed.');
  },
};

// ── screen_type ───────────────────────────────────────────────────────────────
export const screenTypeTool = {
  name: 'screen_type',
  description: 'Type text at the current cursor position using keyboard simulation. Optionally click a location first.',
  category: 'screen',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      text:    { type: 'string',  description: 'Text to type' },
      click_x: { type: 'number',  description: 'Optional: click this X before typing' },
      click_y: { type: 'number',  description: 'Optional: click this Y before typing' },
      press_enter: { type: 'boolean', description: 'Press Enter after typing (default: false)' },
    },
    required: ['text'],
  },
  execute: async (args) => {
    const text = String(args.text ?? '');
    if (args.click_x !== undefined && args.click_y !== undefined) {
      const clicked = await screenClickTool.execute({ x: args.click_x, y: args.click_y });
      if (!clicked.success) return clicked;
    }

    let res;
    if (isWayland()) {
      if (!hasBin('wtype')) return missingDepError('wtype', 'Typing on Wayland needs wtype.');
      res = runFile('wtype', ['--', text], { timeout: 10000 });
      if (res.ok && args.press_enter) res = runFile('wtype', ['-k', 'Return'], { timeout: 2000 });
    } else if (PLATFORM === 'linux') {
      if (!hasBin('xdotool')) return missingDepError('xdotool', 'Install xdotool (X11).');
      res = runFile('xdotool', ['type', '--clearmodifiers', '--delay', '30', '--', text], { timeout: 10000 });
      if (res.ok && args.press_enter) res = runFile('xdotool', ['key', '--clearmodifiers', 'Return'], { timeout: 2000 });
    } else if (PLATFORM === 'darwin') {
      res = runAppleScript(`tell application "System Events" to keystroke ${appleScriptLiteral(text)}`, { timeout: 10000 });
      if (res.ok && args.press_enter) res = runAppleScript('tell application "System Events" to key code 36', { timeout: 2000 });
    } else if (IS_WIN) {
      // SendKeys treats + ^ % ~ ( ) { } [ ] as commands; brace them to type them.
      const sendKeysText = text.replace(/[+^%~(){}[\]]/g, (ch) => `{${ch}}`);
      res = runPowerShell([
        'Add-Type -AssemblyName System.Windows.Forms',
        `[System.Windows.Forms.SendKeys]::SendWait(${powerShellLiteral(sendKeysText)})`,
        ...(args.press_enter ? ["[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"] : []),
      ].join('; '), { timeout: 10000 });
    } else {
      return missingDepError('screen type', 'Linux: wtype or xdotool | macOS: built-in | Windows: built-in PowerShell');
    }
    return res.ok
      ? { success: true, typed: text.slice(0, 100) + (text.length > 100 ? '...' : ''), pressed_enter: !!args.press_enter }
      : fail(res, 'Typing failed.');
  },
};

// ── screen_key ────────────────────────────────────────────────────────────────
const KEY_COMBO = /^[A-Za-z0-9_]+(\+[A-Za-z0-9_]+)*$/;
const MODIFIERS = new Set(['ctrl', 'control', 'shift', 'alt', 'super', 'meta', 'cmd', 'command', 'logo']);

export const screenKeyTool = {
  name: 'screen_key',
  description: 'Press a keyboard shortcut or special key. Examples: "ctrl+c", "Return", "Escape", "ctrl+shift+t".',
  category: 'screen',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Key or combo to press, e.g. "ctrl+c", "Return", "alt+F4"' },
    },
    required: ['key'],
  },
  execute: async (args) => {
    const key = String(args.key || '').trim();
    if (!KEY_COMBO.test(key)) return { success: false, error: 'key must look like "ctrl+c", "Return" or "alt+F4".' };
    const parts = key.split('+');
    const main = parts[parts.length - 1];
    const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
    if (mods.some((m) => !MODIFIERS.has(m))) return { success: false, error: `Unknown modifier in "${key}".` };

    let res;
    if (isWayland()) {
      if (!hasBin('wtype')) return missingDepError('wtype', 'Pressing keys on Wayland needs wtype.');
      const waylandMod = { control: 'ctrl', cmd: 'logo', command: 'logo', super: 'logo', meta: 'logo' };
      const modArgs = mods.flatMap((m) => ['-M', waylandMod[m] || m]);
      const releaseArgs = mods.flatMap((m) => ['-m', waylandMod[m] || m]);
      res = runFile('wtype', [...modArgs, '-k', main, ...releaseArgs], { timeout: 3000 });
    } else if (PLATFORM === 'linux') {
      if (!hasBin('xdotool')) return missingDepError('xdotool', 'Install xdotool (X11).');
      res = runFile('xdotool', ['key', '--clearmodifiers', key], { timeout: 3000 });
    } else if (PLATFORM === 'darwin') {
      const special = { Return: 36, Enter: 36, Escape: 53, Tab: 48, space: 49, BackSpace: 51, Delete: 51 };
      const using = mods.map((m) => ({ ctrl: 'control down', control: 'control down', shift: 'shift down', alt: 'option down', cmd: 'command down', command: 'command down', super: 'command down', meta: 'command down', logo: 'command down' })[m]);
      const action = special[main] !== undefined ? `key code ${special[main]}` : `keystroke ${appleScriptLiteral(main.toLowerCase())}`;
      res = runAppleScript(`tell application "System Events" to ${action}${using.length ? ` using {${using.join(', ')}}` : ''}`, { timeout: 3000 });
    } else if (IS_WIN) {
      const winMod = { ctrl: '^', control: '^', shift: '+', alt: '%' };
      const named = { Return: '{ENTER}', Enter: '{ENTER}', Escape: '{ESC}', Tab: '{TAB}', BackSpace: '{BACKSPACE}', Delete: '{DELETE}' };
      const body = named[main] || (/^F\d{1,2}$/.test(main) ? `{${main}}` : main.toLowerCase());
      const combo = mods.map((m) => winMod[m] || '').join('') + body;
      res = runPowerShell(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${powerShellLiteral(combo)})`, { timeout: 3000 });
    } else {
      return missingDepError('screen key', 'Linux: wtype or xdotool | macOS: built-in | Windows: built-in PowerShell');
    }
    return res.ok ? { success: true, key } : fail(res, 'Key press failed.');
  },
};

// ── Windows ───────────────────────────────────────────────────────────────────
function listWindows() {
  if (isHyprland()) {
    return hyprClients().map((c) => ({
      id: c.address,
      title: c.title,
      app: c.class,
      geometry: { x: c.at?.[0], y: c.at?.[1], width: c.size?.[0], height: c.size?.[1] },
    }));
  }
  if (PLATFORM === 'linux') {
    if (!hasBin('xdotool')) return null;
    const ids = runFile('xdotool', ['search', '--onlyvisible', '--name', '.'], { timeout: 3000 }).stdout.trim().split('\n').filter(Boolean);
    return ids.slice(0, 100).map((id) => {
      const title = runFile('xdotool', ['getwindowname', id], { timeout: 1000 }).stdout.trim() || '(unknown)';
      const geometry = {};
      for (const line of runFile('xdotool', ['getwindowgeometry', '--shell', id], { timeout: 1000 }).stdout.split('\n')) {
        const [k, v] = line.split('=');
        if (k && v !== undefined) geometry[k.toLowerCase()] = Number(v) || v;
      }
      return { id, title, geometry };
    });
  }
  if (PLATFORM === 'darwin') {
    const res = runAppleScript('tell application "System Events" to get name of every process whose background only is false', { timeout: 3000 });
    return res.stdout.split(',').map((s) => s.trim()).filter(Boolean).map((title) => ({ title }));
  }
  if (IS_WIN) {
    const res = runPowerShell('Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Id,MainWindowTitle | ConvertTo-Json', { timeout: 5000 });
    const parsed = JSON.parse(res.stdout || '[]');
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((r) => ({ id: r.Id, title: r.MainWindowTitle }));
  }
  return null;
}

export const windowListTool = {
  name: 'window_list',
  description: 'List open desktop windows with their ids, titles and geometry when available. Pass filter to find the windows of one app or with a title, e.g. before window_focus.',
  category: 'screen',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string', description: 'Only windows whose title or app contains this (case-insensitive).' },
    },
    required: [],
  },
  execute: async (args = {}) => {
    try {
      const all = listWindows();
      if (!all) return missingDepError('window list', 'Linux: hyprctl or xdotool | macOS: osascript | Windows: PowerShell');
      const needle = String(args.filter || '').trim().toLowerCase();
      const windows = needle ? all.filter((w) => `${w.title || ''} ${w.app || ''}`.toLowerCase().includes(needle)) : all;
      return { success: true, count: windows.length, windows };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const windowFocusTool = {
  name: 'window_focus',
  description: 'Focus an open window by title substring or exact window id.',
  category: 'screen',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Window title substring to focus.' },
      id: { type: 'string', description: 'Optional exact window id.' },
    },
    required: [],
  },
  execute: async (args) => {
    try {
      let res;
      if (isHyprland()) {
        const client = args.id
          ? hyprClients().find((c) => c.address === args.id)
          : hyprClients().find((c) => matchesTitle(c, args.title));
        if (!client) return { success: false, error: `No window found for: ${args.title || args.id || '(empty)'}` };
        res = runFile('hyprctl', ['dispatch', 'focuswindow', `address:${client.address}`], { timeout: 3000 });
        return res.ok ? { success: true, id: client.address, title: client.title } : fail(res, 'Focus failed.');
      }
      if (PLATFORM === 'linux') {
        if (!hasBin('xdotool')) return missingDepError('xdotool', 'Install xdotool (X11).');
        const id = /^\d+$/.test(String(args.id || ''))
          ? String(args.id)
          : runFile('xdotool', ['search', '--name', String(args.title || '')], { timeout: 3000 }).stdout.trim().split('\n')[0];
        if (!id) return { success: false, error: `No window found for: ${args.title || args.id || '(empty)'}` };
        res = runFile('xdotool', ['windowactivate', '--sync', id], { timeout: 3000 });
        return res.ok ? { success: true, id, title: args.title || null } : fail(res, 'Focus failed.');
      }
      if (PLATFORM === 'darwin') {
        if (!args.title) return { success: false, error: 'title is required on macOS' };
        res = runAppleScript(`tell application ${appleScriptLiteral(args.title)} to activate`, { timeout: 3000 });
        return res.ok ? { success: true, title: args.title } : fail(res, 'Focus failed.');
      }
      if (IS_WIN) {
        if (!args.title) return { success: false, error: 'title is required on Windows' };
        res = runPowerShell(`(New-Object -ComObject WScript.Shell).AppActivate(${powerShellLiteral(args.title)}); Start-Sleep -Milliseconds 200`, { timeout: 5000 });
        return res.ok ? { success: true, title: args.title } : fail(res, `Could not focus window "${args.title}".`);
      }
      return missingDepError('window focus', 'Linux: hyprctl or xdotool | macOS: osascript | Windows: built-in PowerShell');
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const screenTools = [
  takeScreenshotTool,
  screenReadTool,
  screenClickTool,
  screenTypeTool,
  screenKeyTool,
  windowListTool,
  windowFocusTool,
];
export default screenTools;
