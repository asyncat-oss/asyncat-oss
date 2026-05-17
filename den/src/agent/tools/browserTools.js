// den/src/agent/tools/browserTools.js
// ─── Browser Automation Tools ────────────────────────────────────────────────
// Puppeteer-based web automation for the agent.
// Uses the already-installed puppeteer dependency.
// Provides: browse_url, screenshot_page, browser_navigate, browser_click,
//   browser_type, browser_fill, browser_extract

import { PermissionLevel } from './toolRegistry.js';
import { truncate, missingDepError } from './shared.js';

let browserInstance = null;
let activePage = null;

async function getActivePage() {
  if (activePage && !activePage.isClosed()) return activePage;
  const browser = await getBrowser();
  activePage = await browser.newPage();
  await activePage.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
  return activePage;
}

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

// ── browser_navigate ──────────────────────────────────────────────────────────
export const browserNavigateTool = {
  name: 'browser_navigate',
  description: 'Navigate the active browser page to a URL. Creates a new page if none exists. Use before browser_click/type/fill/extract.',
  category: 'browser',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate to' },
      wait_for: { type: 'string', description: 'CSS selector to wait for after navigation (optional)' },
      timeout: { type: 'number', description: 'Navigation timeout in seconds (default: 15)' },
    },
    required: ['url'],
  },
  execute: async (args) => {
    try {
      const page = await getActivePage();
      const timeout = (args.timeout || 15) * 1000;
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout });
      if (args.wait_for) {
        await page.waitForSelector(args.wait_for, { timeout: 5000 }).catch(() => {});
      }
      await new Promise(r => setTimeout(r, 1000));
      const title = await page.title();
      const url = page.url();
      return { success: true, url, title };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── browser_click ────────────────────────────────────────────────────────────
export const browserClickTool = {
  name: 'browser_click',
  description: 'Click an element on the active browser page by CSS selector. Use after browser_navigate.',
  category: 'browser',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the element to click' },
      wait: { type: 'number', description: 'Milliseconds to wait after click (default: 1000)' },
    },
    required: ['selector'],
  },
  execute: async (args) => {
    try {
      const page = await getActivePage();
      await page.waitForSelector(args.selector, { timeout: 5000 });
      await page.click(args.selector);
      if (args.wait) await new Promise(r => setTimeout(r, args.wait));
      return { success: true, selector: args.selector };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── browser_type ──────────────────────────────────────────────────────────────
export const browserTypeTool = {
  name: 'browser_type',
  description: 'Type text into an input field on the active browser page. Optionally clear the field first. Use after browser_navigate.',
  category: 'browser',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the input element' },
      text: { type: 'string', description: 'Text to type' },
      clear: { type: 'boolean', description: 'Clear the field before typing (default: true)' },
      press_enter: { type: 'boolean', description: 'Press Enter after typing (default: false)' },
    },
    required: ['selector', 'text'],
  },
  execute: async (args) => {
    try {
      const page = await getActivePage();
      await page.waitForSelector(args.selector, { timeout: 5000 });
      if (args.clear !== false) await (await page.$(args.selector)).click({ clickCount: 3 });
      await page.type(args.selector, args.text, { delay: 50 });
      if (args.press_enter) await page.keyboard.press('Enter');
      return { success: true, selector: args.selector, text: args.text.slice(0, 100) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── browser_fill ──────────────────────────────────────────────────────────────
export const browserFillTool = {
  name: 'browser_fill',
  description: 'Fill a form on the active browser page. Takes key-value pairs of { selector: value } to fill multiple fields at once, then optionally submits.',
  category: 'browser',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      fields: { type: 'object', description: 'Key-value pairs of { CSS selector: value to fill }' },
      submit_selector: { type: 'string', description: 'CSS selector of submit button to click after filling (optional)' },
    },
    required: ['fields'],
  },
  execute: async (args) => {
    try {
      const page = await getActivePage();
      const results = {};
      for (const [selector, value] of Object.entries(args.fields)) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          await (await page.$(selector)).click({ clickCount: 3 });
          await page.type(selector, String(value), { delay: 30 });
          results[selector] = 'filled';
        } catch (err) {
          results[selector] = `error: ${err.message}`;
        }
      }
      if (args.submit_selector) {
        await page.waitForSelector(args.submit_selector, { timeout: 3000 });
        await page.click(args.submit_selector);
        await new Promise(r => setTimeout(r, 1000));
      }
      return { success: true, results, url: page.url() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── browser_extract ──────────────────────────────────────────────────────────
export const browserExtractTool = {
  name: 'browser_extract',
  description: 'Extract data from the active browser page using CSS selectors. Returns text content, attributes, or structured data from matching elements.',
  category: 'browser',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of elements to extract data from' },
      attribute: { type: 'string', description: 'Attribute to extract (e.g. "href", "src"). If omitted, returns textContent.' },
      multiple: { type: 'boolean', description: 'If true, extract from all matching elements (default: false)' },
      structure: { type: 'object', description: 'Extract structured data: { "key": "css-selector" } pairs. Overrides selector.' },
    },
  },
  execute: async (args) => {
    try {
      const page = await getActivePage();
      if (args.structure) {
        const result = {};
        for (const [key, sel] of Object.entries(args.structure)) {
          result[key] = await page.$$eval(sel, (els, attr) => attr
            ? els.map(el => el.getAttribute(attr))
            : els.map(el => el.textContent?.trim()), args.attribute || null
          ).catch(() => []);
        }
        return { success: true, data: result };
      }
      if (args.multiple) {
        const items = await page.$$eval(args.selector, (els, attr) => attr
          ? els.map(el => el.getAttribute(attr))
          : els.map(el => el.textContent?.trim()), args.attribute || null
        );
        return { success: true, count: items.length, data: items };
      }
      const el = await page.$(args.selector);
      if (!el) return { success: false, error: `No element found for selector: ${args.selector}` };
      const value = args.attribute
        ? await el.getAttribute(args.attribute)
        : await el.evaluate(e => e.textContent?.trim());
      return { success: true, selector: args.selector, data: value };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const browserTools = [browseUrlTool, screenshotTool, browserNavigateTool, browserClickTool, browserTypeTool, browserFillTool, browserExtractTool];
export default browserTools;
