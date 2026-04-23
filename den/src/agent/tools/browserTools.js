// den/src/agent/tools/browserTools.js
// ─── Browser Automation Tools ────────────────────────────────────────────────
// Puppeteer-based web automation for the agent.
// Uses the already-installed puppeteer dependency.

import { PermissionLevel } from './toolRegistry.js';

let browserInstance = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;
  const puppeteer = await import('puppeteer');
  browserInstance = await puppeteer.default.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return browserInstance;
}

async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

// Clean up on process exit
process.on('exit', () => { closeBrowser(); });

export const browseUrlTool = {
  name: 'browse_url',
  description: 'Open a URL in a headless browser and extract the rendered page content. Unlike fetch_url, this executes JavaScript and renders the page fully. Use for SPAs, dynamic pages, or pages that require JS.',
  category: 'browser',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to browse' },
      wait_for: { type: 'string', description: 'CSS selector to wait for before extracting (optional)' },
      timeout: { type: 'number', description: 'Page load timeout in seconds (default: 15)' },
    },
    required: ['url'],
  },
  execute: async (args) => {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

      const timeout = (args.timeout || 15) * 1000;
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout });

      if (args.wait_for) {
        await page.waitForSelector(args.wait_for, { timeout: 5000 }).catch(() => {});
      }

      // Wait a bit for JS to render
      await new Promise(r => setTimeout(r, 1500));

      const title = await page.title();
      const text = await page.evaluate(() => {
        // Remove noise
        document.querySelectorAll('script, style, nav, header, footer, aside, iframe').forEach(el => el.remove());
        const article = document.querySelector('article') || document.querySelector('main') || document.body;
        return article?.innerText || '';
      });

      const truncated = text.length > 8000 ? text.slice(0, 8000) + '\n... [truncated]' : text;
      await page.close();

      return { success: true, url: args.url, title, content: truncated };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const screenshotTool = {
  name: 'screenshot_page',
  description: 'Take a screenshot of a web page. Returns the file path of the saved screenshot.',
  category: 'browser',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to screenshot' },
      full_page: { type: 'boolean', description: 'Capture full page or just viewport (default: false)' },
    },
    required: ['url'],
  },
  execute: async (args, context) => {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 2000));

      const fs = await import('fs');
      const path = await import('path');
      const dir = path.default.join(context.workingDir, '.agent_tmp');
      fs.default.mkdirSync(dir, { recursive: true });
      const filePath = path.default.join(dir, `screenshot_${Date.now()}.png`);
      await page.screenshot({ path: filePath, fullPage: args.full_page || false });
      await page.close();

      return { success: true, url: args.url, screenshot_path: filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const browserTools = [browseUrlTool, screenshotTool];
export default browserTools;
