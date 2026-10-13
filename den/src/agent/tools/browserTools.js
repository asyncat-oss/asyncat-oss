// den/src/agent/tools/browserTools.js
// ─── Browser Automation Tools ────────────────────────────────────────────────
// browse_url, screenshot_page, browser_navigate, browser_click, browser_type,
// browser_fill, browser_extract.
//
// With the desktop app running they use hidden tabs of its built-in browser
// in the Standard profile, so they share sign-ins with the browser panel,
// and sensitive steps (passwords, card numbers, buy/delete buttons) ask the
// user. Without it (backend on its own) they fall back to a headless
// Puppeteer browser with a throwaway profile.

import { PermissionLevel } from './toolRegistry.js';
import { truncate, missingDepError } from './shared.js';
import { getTmpDir } from '../workspacePaths.js';
import { launchBrowser } from '../../lib/browserLauncher.js';
import { checkAgentUrl, guardPuppeteerPage } from './urlPolicy.js';
import { isBrowserAvailable, runBrowserAction, sendBrowserCommand } from '../browserCommandQueue.js';

async function hostCommand(action, params, context, timeoutMs = 45_000) {
  try {
    return await sendBrowserCommand(action, params, context, { timeoutMs });
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

let browserInstance = null;
let activePage = null;

/** A new tab whose every request goes through the agent URL policy. */
async function newGuardedPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
  await guardPuppeteerPage(page);
  return page;
}

async function getActivePage() {
  if (activePage && !activePage.isClosed()) return activePage;
  const browser = await getBrowser();
  activePage = await newGuardedPage(browser);
  return activePage;
}

async function getBrowser() {
  if (browserInstance) return browserInstance;
  browserInstance = await launchBrowser({
    headless: true,
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
  execute: async (args, context) => {
    try {
      const check = await checkAgentUrl(args.url);
      if (!check.ok) return { success: false, error: check.reason };
      if (isBrowserAvailable()) {
        const result = await hostCommand('read_page', { url: check.url, waitFor: args.wait_for || null, timeoutMs: (args.timeout || 15) * 1000 }, context);
        return result?.success === false ? result : { success: true, url: result.url, title: result.title, content: result.content, ...(result.truncated ? { truncated: true } : {}) };
      }
      const browser = await getBrowser();
      const page = await newGuardedPage(browser);

      const timeout = (args.timeout || 15) * 1000;
      await page.goto(check.url, { waitUntil: 'domcontentloaded', timeout });

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
      const check = await checkAgentUrl(args.url);
      if (!check.ok) return { success: false, error: check.reason };
      if (isBrowserAvailable()) {
        const shot = await hostCommand('screenshot_url', { url: check.url, fullPage: Boolean(args.full_page) }, context);
        // A page can only be photographed while Asyncat's window is open;
        // otherwise the headless browser below still can.
        if (shot?.success && shot.dataUrl) {
          const fs = await import('fs');
          const path = await import('path');
          const dir = getTmpDir(context.workingDir);
          fs.default.mkdirSync(dir, { recursive: true });
          const filePath = path.default.join(dir, `screenshot_${Date.now()}.jpg`);
          fs.default.writeFileSync(filePath, Buffer.from(shot.dataUrl.split(',')[1], 'base64'));
          return { success: true, url: shot.url || check.url, title: shot.title, screenshot_path: filePath, dataUrl: shot.dataUrl };
        }
        if (!/not on screen/i.test(shot?.error || '')) return shot;
      }
      const browser = await getBrowser();
      const page = await newGuardedPage(browser);
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(check.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 2000));

      const fs = await import('fs');
      const path = await import('path');
      const dir = getTmpDir(context.workingDir);
      fs.default.mkdirSync(dir, { recursive: true });
      const filePath = path.default.join(dir, `screenshot_${Date.now()}.png`);
      await page.screenshot({ path: filePath, fullPage: args.full_page || false });
      await page.close();

      const imageData = fs.default.readFileSync(filePath);
      // dataUrl: the model sees the image (see AgentRuntime._toolResultMessage).
      const dataUrl = `data:image/png;base64,${imageData.toString('base64')}`;

      return { success: true, url: args.url, screenshot_path: filePath, dataUrl };
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
  execute: async (args, context) => {
    try {
      const check = await checkAgentUrl(args.url);
      if (!check.ok) return { success: false, error: check.reason };
      if (isBrowserAvailable()) {
        const result = await hostCommand('headless_navigate', { url: check.url, waitFor: args.wait_for || null, timeoutMs: (args.timeout || 15) * 1000 }, context);
        return result?.success === false ? result : { success: true, url: result.url, title: result.title };
      }
      const page = await getActivePage();
      const timeout = (args.timeout || 15) * 1000;
      await page.goto(check.url, { waitUntil: 'domcontentloaded', timeout });
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
  execute: async (args, context) => {
    try {
      if (isBrowserAvailable()) {
        const result = await runBrowserAction('headless_click', { selector: args.selector }, context, { toolName: 'browser_click', args, timeoutMs: 40_000 });
        if (result?.success && args.wait) await new Promise(r => setTimeout(r, Math.min(Number(args.wait) || 0, 10_000)));
        return result?.success ? { success: true, selector: args.selector, url: result.url, title: result.title, ...(result.navigated ? { navigated: true } : {}) } : result;
      }
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
  execute: async (args, context) => {
    try {
      if (isBrowserAvailable()) {
        const result = await runBrowserAction('headless_type', {
          selector: args.selector, text: String(args.text ?? ''), clear: args.clear !== false, submit: Boolean(args.press_enter),
        }, context, { toolName: 'browser_type', args, timeoutMs: 40_000 });
        return result?.success ? { success: true, selector: args.selector, url: result.url } : result;
      }
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
  execute: async (args, context) => {
    try {
      if (isBrowserAvailable()) {
        const results = {};
        for (const [selector, value] of Object.entries(args.fields || {})) {
          const filled = await runBrowserAction('headless_type', { selector, text: String(value ?? ''), clear: true }, context, {
            toolName: 'browser_fill', args: { selector, value }, timeoutMs: 40_000,
          });
          results[selector] = filled?.success ? 'filled' : `error: ${filled?.error || 'failed'}`;
        }
        let url;
        if (args.submit_selector) {
          const submitted = await runBrowserAction('headless_click', { selector: args.submit_selector }, context, {
            toolName: 'browser_fill', args: { submit_selector: args.submit_selector }, timeoutMs: 40_000,
          });
          if (!submitted?.success) return { success: false, results, error: submitted?.error || 'Could not submit the form.' };
          url = submitted.url;
        }
        return { success: true, results, ...(url ? { url } : {}) };
      }
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
  execute: async (args, context) => {
    try {
      if (isBrowserAvailable()) {
        if (!args.structure && !args.selector) return { success: false, error: 'Pass a selector or a structure.' };
        const result = await hostCommand('headless_extract', {
          selector: args.selector, attribute: args.attribute, multiple: Boolean(args.multiple), structure: args.structure,
        }, context);
        return result?.success === false ? result : { success: true, ...(args.selector && !args.structure && !args.multiple ? { selector: args.selector } : {}), ...result };
      }
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
