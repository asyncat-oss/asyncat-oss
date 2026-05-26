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

export const desktopTools = [clipboardReadTool, clipboardWriteTool, revealInFinderTool];
