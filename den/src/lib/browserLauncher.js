// Launch Chromium for puppeteer-based features (PDF export, browser tools).
//
// Desktop releases skip puppeteer's Chrome download to keep installers small,
// so puppeteer.launch() on its own fails there with "Could not find Chrome".
// In that case fall back to a Chrome, Chromium, or Edge already installed on
// the machine. PUPPETEER_EXECUTABLE_PATH still wins when it is set.
import fs from 'fs';
import path from 'path';

const LINUX_COMMANDS = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'microsoft-edge',
  'microsoft-edge-stable',
];

const MAC_APPS = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Chromium.app/Contents/MacOS/Chromium',
  'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const WINDOWS_PATHS = [
  ['LOCALAPPDATA', 'Google/Chrome/Application/chrome.exe'],
  ['PROGRAMFILES', 'Google/Chrome/Application/chrome.exe'],
  ['PROGRAMFILES(X86)', 'Google/Chrome/Application/chrome.exe'],
  ['PROGRAMFILES(X86)', 'Microsoft/Edge/Application/msedge.exe'],
  ['PROGRAMFILES', 'Microsoft/Edge/Application/msedge.exe'],
];

function isExecutableFile(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function findSystemBrowser({ platform = process.platform, env = process.env, home = env.HOME } = {}) {
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
  return candidates.find(isExecutableFile) || null;
}

export async function launchBrowser(options = {}) {
  const { default: puppeteer } = await import('puppeteer');
  try {
    return await puppeteer.launch(options);
  } catch (err) {
    if (options.executablePath || !/could not find/i.test(err.message)) throw err;
    const executablePath = findSystemBrowser();
    if (!executablePath) {
      throw new Error(
        'No Chromium-based browser found. Install Google Chrome (or Chromium or Microsoft Edge), '
        + 'or set PUPPETEER_EXECUTABLE_PATH to one.',
      );
    }
    return puppeteer.launch({ ...options, executablePath });
  }
}
