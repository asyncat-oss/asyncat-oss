// den/src/agent/tools/screenTools.js
// ─── Screen Controller Tools ─────────────────────────────────────────────────
// Lets the agent see and interact with the desktop:
//   take_screenshot  — captures the full screen or a window as PNG
//   screen_click     — moves mouse and clicks at x,y
//   screen_type      — types text via keyboard
//   screen_read      — runs OCR on the last screenshot (text extraction)
//
// Linux: uses scrot/gnome-screenshot + xdotool (sudo apt install scrot xdotool)
// macOS: uses screencapture + cliclick
// Windows: uses native PowerShell commands
// All output is written to a temp file, path returned to agent.
// Zero new npm packages — pure child_process.

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PermissionLevel } from './toolRegistry.js';

const TMP_DIR = path.join(os.tmpdir(), 'asyncat-screen');
fs.mkdirSync(TMP_DIR, { recursive: true });

const PLATFORM = os.platform();
const IS_WIN = PLATFORM === 'win32';

// ── Helper: check if a binary is available ───────────────────────────────────
function hasBin(bin) {
  try { 
    const cmd = IS_WIN ? `where ${bin} 2>nul` : `which ${bin} 2>/dev/null`;
    execSync(cmd); 
    return true; 
  } catch { return false; }
}

// ── take_screenshot ───────────────────────────────────────────────────────────
export const takeScreenshotTool = {
  name: 'take_screenshot',
  description: 'Capture the current screen or a specific window as a PNG image. Returns the file path. Use before screen_read or to observe UI state. Requires: scrot (Linux) or screencapture (macOS).',
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
    const fname = args.output_name || `screen_${Date.now()}.png`;
    const outPath = path.join(TMP_DIR, path.basename(fname));

    try {
      if (PLATFORM === 'linux') {
        if (args.window_title) {
          // Focus then screenshot with scrot
          if (hasBin('xdotool') && hasBin('scrot')) {
            execSync(`xdotool search --name "${args.window_title}" windowfocus --sync 2>/dev/null; scrot "${outPath}" --focused --delay 0 2>/dev/null || scrot "${outPath}" 2>/dev/null`, { timeout: 8000 });
          } else if (hasBin('gnome-screenshot')) {
            execSync(`gnome-screenshot -f "${outPath}" 2>/dev/null`, { timeout: 8000 });
          } else {
            return { success: false, error: 'No screenshot tool found. Install: sudo apt install scrot xdotool' };
          }
        } else {
          if (hasBin('scrot')) {
            execSync(`scrot "${outPath}" 2>/dev/null`, { timeout: 8000 });
          } else if (hasBin('gnome-screenshot')) {
            execSync(`gnome-screenshot -f "${outPath}" 2>/dev/null`, { timeout: 8000 });
          } else if (hasBin('import')) {
            execSync(`import -window root "${outPath}" 2>/dev/null`, { timeout: 8000 });
          } else {
            return { success: false, error: 'No screenshot tool found. Install: sudo apt install scrot' };
          }
        }
      } else if (PLATFORM === 'darwin') {
        execSync(`screencapture -x "${outPath}" 2>/dev/null`, { timeout: 8000 });
      } else {
        return { success: false, error: `Platform "${PLATFORM}" not yet supported for screenshots.` };
      }

      if (!fs.existsSync(outPath)) {
        return { success: false, error: 'Screenshot file not created. Check display environment (DISPLAY variable).' };
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
  description: 'Extract text from a screenshot using OCR (tesseract). Call take_screenshot first to get the file path. Returns the recognized text. Requires: tesseract-ocr (sudo apt install tesseract-ocr).',
  category: 'screen',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      image_path: { type: 'string', description: 'Path to the PNG/JPEG to read. Use the path returned by take_screenshot.' },
    },
    required: ['image_path'],
  },
  execute: async (args) => {
    const imgPath = args.image_path;
    if (!fs.existsSync(imgPath)) {
      return { success: false, error: `File not found: ${imgPath}` };
    }
    if (!hasBin('tesseract')) {
      return { success: false, error: 'tesseract not found. Install: sudo apt install tesseract-ocr' };
    }
    try {
      const outBase = path.join(TMP_DIR, `ocr_${Date.now()}`);
      execSync(`tesseract "${imgPath}" "${outBase}" 2>/dev/null`, { timeout: 15000 });
      const txtPath = outBase + '.txt';
      const text = fs.readFileSync(txtPath, 'utf8').trim();
      try { fs.unlinkSync(txtPath); } catch {}
      return { success: true, text: text.slice(0, 8000), chars: text.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── screen_click ──────────────────────────────────────────────────────────────
export const screenClickTool = {
  name: 'screen_click',
  description: 'Move the mouse to screen coordinates (x, y) and click. Supports left, right, and double clicks. Use after take_screenshot to identify coordinates. Requires: xdotool (Linux) or cliclick (macOS).',
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
    const x = Math.round(args.x);
    const y = Math.round(args.y);
    const button = args.button || 'left';

    try {
      if (PLATFORM === 'linux') {
        if (!hasBin('xdotool')) {
          return { success: false, error: 'xdotool not found. Install: sudo apt install xdotool' };
        }
        if (button === 'double') {
          execSync(`xdotool mousemove ${x} ${y} click --clearmodifiers 1 click --clearmodifiers 1`, { timeout: 5000 });
        } else if (button === 'right') {
          execSync(`xdotool mousemove ${x} ${y} click --clearmodifiers 3`, { timeout: 5000 });
        } else {
          execSync(`xdotool mousemove ${x} ${y} click --clearmodifiers 1`, { timeout: 5000 });
        }
      } else if (PLATFORM === 'darwin') {
        if (!hasBin('cliclick')) {
          return { success: false, error: 'cliclick not found. Install: brew install cliclick' };
        }
        const action = button === 'double' ? 'dc' : button === 'right' ? 'rc' : 'c';
        execSync(`cliclick ${action}:${x},${y}`, { timeout: 5000 });
      } else {
        return { success: false, error: `Platform "${PLATFORM}" not supported for screen control.` };
      }
      return { success: true, x, y, button };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── screen_type ───────────────────────────────────────────────────────────────
export const screenTypeTool = {
  name: 'screen_type',
  description: 'Type text at the current cursor position using keyboard simulation. Optionally click a location first. Requires: xdotool (Linux) or cliclick (macOS).',
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
    try {
      if (PLATFORM === 'linux') {
        if (!hasBin('xdotool')) {
          return { success: false, error: 'xdotool not found. Install: sudo apt install xdotool' };
        }
        if (args.click_x !== undefined && args.click_y !== undefined) {
          execSync(`xdotool mousemove ${Math.round(args.click_x)} ${Math.round(args.click_y)} click --clearmodifiers 1`, { timeout: 3000 });
        }
        // Escape single quotes in text for shell
        const safe = args.text.replace(/'/g, "'\\''");
        execSync(`xdotool type --clearmodifiers --delay 30 '${safe}'`, { timeout: 10000 });
        if (args.press_enter) {
          execSync(`xdotool key --clearmodifiers Return`, { timeout: 2000 });
        }
      } else if (PLATFORM === 'darwin') {
        if (!hasBin('cliclick')) {
          return { success: false, error: 'cliclick not found. Install: brew install cliclick' };
        }
        if (args.click_x !== undefined && args.click_y !== undefined) {
          execSync(`cliclick c:${Math.round(args.click_x)},${Math.round(args.click_y)}`, { timeout: 3000 });
        }
        // macOS: use osascript for reliable typing
        const escaped = args.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        execSync(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`, { timeout: 10000 });
        if (args.press_enter) {
          execSync(`osascript -e 'tell application "System Events" to key code 36'`, { timeout: 2000 });
        }
      } else {
        return { success: false, error: `Platform "${PLATFORM}" not supported.` };
      }
      return { success: true, typed: args.text.slice(0, 100) + (args.text.length > 100 ? '...' : ''), pressed_enter: !!args.press_enter };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── screen_key ────────────────────────────────────────────────────────────────
export const screenKeyTool = {
  name: 'screen_key',
  description: 'Press a keyboard shortcut or special key. Examples: "ctrl+c", "Return", "Escape", "ctrl+shift+t". Requires: xdotool (Linux).',
  category: 'screen',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Key or combo to press. Use xdotool key syntax: "ctrl+c", "Return", "alt+F4", "super"' },
    },
    required: ['key'],
  },
  execute: async (args) => {
    try {
      if (PLATFORM === 'linux') {
        if (!hasBin('xdotool')) return { success: false, error: 'xdotool not found. Install: sudo apt install xdotool' };
        execSync(`xdotool key --clearmodifiers ${args.key}`, { timeout: 3000 });
      } else if (PLATFORM === 'darwin') {
        // Map common keys to osascript
        const keyMap = { 'ctrl+c': 'key code 8 using control down', 'Return': 'key code 36', 'Escape': 'key code 53' };
        const cmd = keyMap[args.key] || `keystroke "${args.key}"`;
        execSync(`osascript -e 'tell application "System Events" to ${cmd}'`, { timeout: 3000 });
      }
      return { success: true, key: args.key };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── screen_find_window ────────────────────────────────────────────────────────
export const screenFindWindowTool = {
  name: 'screen_find_window',
  description: 'Find open windows matching a name pattern. Returns window IDs and titles. Use to focus a specific application before interacting with it.',
  category: 'screen',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Window title pattern to search for (case-insensitive substring)' },
    },
    required: ['pattern'],
  },
  execute: async (args) => {
    try {
      if (PLATFORM === 'linux') {
        if (!hasBin('xdotool')) return { success: false, error: 'xdotool not found. Install: sudo apt install xdotool' };
        const out = execSync(`xdotool search --name "${args.pattern}" 2>/dev/null || true`, { encoding: 'utf8', timeout: 3000 });
        const ids = out.trim().split('\n').filter(Boolean);
        const windows = ids.map(id => {
          try {
            const name = execSync(`xdotool getwindowname ${id} 2>/dev/null`, { encoding: 'utf8', timeout: 1000 }).trim();
            return { id, title: name };
          } catch { return { id, title: '(unknown)' }; }
        });
        return { success: true, count: windows.length, windows };
      } else {
        return { success: false, error: `Window search not yet supported on ${PLATFORM}` };
      }
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
  screenFindWindowTool,
];
export default screenTools;
