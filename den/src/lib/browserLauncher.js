// Launch Chromium for puppeteer-based features (PDF export, browser tools).
//
// Desktop releases skip puppeteer's Chrome download to keep installers small,
// so puppeteer's own Chrome is often missing. Then a Chrome, Chromium, Edge or
// Brave already installed on the machine is used. Puppeteer's own is also
// passed over when it sits where the agent's sandboxed commands can write
// (~/.cache/puppeteer): the browser runs outside the sandbox, so a command
// could otherwise leave a program there for den to start.
// PUPPETEER_EXECUTABLE_PATH still wins when it is set.
import fs from 'fs';
import path from 'path';
import { childEnv } from '../agent/childEnv.js';
import { sandboxCanChange } from '../agent/sandboxFolders.js';

const LINUX_COMMANDS = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'microsoft-edge',
  'microsoft-edge-stable',
  'brave',
  'brave-browser',
];

const MAC_APPS = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Chromium.app/Contents/MacOS/Chromium',
  'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'Brave Browser.app/Contents/MacOS/Brave Browser',
];

const WINDOWS_PATHS = [
  ['LOCALAPPDATA', 'Google/Chrome/Application/chrome.exe'],
  ['PROGRAMFILES', 'Google/Chrome/Application/chrome.exe'],
  ['PROGRAMFILES(X86)', 'Google/Chrome/Application/chrome.exe'],
  ['PROGRAMFILES(X86)', 'Microsoft/Edge/Application/msedge.exe'],
  ['PROGRAMFILES', 'Microsoft/Edge/Application/msedge.exe'],
  ['LOCALAPPDATA', 'BraveSoftware/Brave-Browser/Application/brave.exe'],
  ['PROGRAMFILES', 'BraveSoftware/Brave-Browser/Application/brave.exe'],
];

function isExecutableFile(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** The first browser installed on this machine that `usable` accepts, or null. */
export function findSystemBrowser({ platform = process.platform, env = process.env, home = env.HOME, usable = () => true } = {}) {
  let candidates = [];
  if (platform === 'win32') {
    candidates = WINDOWS_PATHS
      .filter(([variable]) => env[variable])
      .map(([variable, relative]) => path.win32.join(env[variable], relative));
  } else if (platform === 'darwin') {
    const roots = ['/Applications', home && path.posix.join(home, 'Applications')].filter(Boolean);
    candidates = roots.flatMap((root) => MAC_APPS.map((app) => path.posix.join(root, app)));
  } else {
    const dirs = String(env.PATH || '').split(path.delimiter).filter(Boolean);
    candidates = LINUX_COMMANDS.flatMap((command) => dirs.map((dir) => path.join(dir, command)));
  }
  return candidates.find((file) => isExecutableFile(file) && usable(file)) || null;
}

/**
 * Which browser to start: `own` is puppeteer's (null when it has none).
 * Puppeteer's own only when a sandboxed command can't have put it there.
 */
export function chooseBrowser({ own, canChange = sandboxCanChange, findSystem = findSystemBrowser } = {}) {
  if (own && isExecutableFile(own) && !canChange(own)) return own;
  const system = findSystem({ usable: (file) => !canChange(file) });
  if (system) return system;
  if (own && isExecutableFile(own)) {
    throw new Error(
      `Puppeteer's own browser (${own}) is in a folder the agent's commands can change, so it isn't started. `
      + 'Install Google Chrome (or Chromium, Microsoft Edge or Brave), or set PUPPETEER_EXECUTABLE_PATH to one.',
    );
  }
  throw new Error(
    'No Chromium-based browser found. Install Google Chrome (or Chromium or Microsoft Edge), '
    + 'or set PUPPETEER_EXECUTABLE_PATH to one.',
  );
}

export async function launchBrowser(options = {}, { puppeteer: given = null } = {}) {
  const puppeteer = given || (await import('puppeteer')).default;
  // Like every program the agent starts, the browser gets den's environment
  // without saved keys, unless the caller gives one.
  const launchOptions = { ...options, env: options.env ?? childEnv() };
  if (launchOptions.executablePath || process.env.PUPPETEER_EXECUTABLE_PATH) return puppeteer.launch(launchOptions);
  let own = null;
  try { own = await puppeteer.executablePath(); } catch { own = null; }
  return puppeteer.launch({ ...launchOptions, executablePath: chooseBrowser({ own }) });
}
