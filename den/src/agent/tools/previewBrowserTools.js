// den/src/agent/tools/previewBrowserTools.js
// ─── The built-in browser, for the agent ─────────────────────────────────────
//
// Tabs live in the desktop app (electron/browserHost.js); these tools send it
// commands over the host bridge (see ../browserCommandQueue.js). They work
// with the chat screen closed and in scheduled runs, as long as the desktop
// app is running.
//
// How the agent sees and acts:
//   preview_snapshot  → an outline of the page from its accessibility tree,
//                       with refs like [e12] for elements
//   preview_click / preview_type / preview_select_option / preview_press_key
//                     → act on a ref with real mouse and keyboard input
//   preview_screenshot → a picture of the page, when the look matters
// Sensitive actions (passwords, card numbers, buy/delete/send buttons, file
// pickers) are recognised by the desktop app from the element itself and
// need the user's yes. Sign-ins and captchas are handed to the user with
// preview_ask_user.

import { PermissionLevel } from './toolRegistry.js';
import { checkAgentUrl } from './urlPolicy.js';
import { sendToHost } from '../../lib/hostBridge.js';
import { runBrowserAction, sendBrowserCommand } from '../browserCommandQueue.js';

const TARGET_PROPS = {
  ref: { type: 'string', description: 'Element ref from the latest preview_snapshot, e.g. "e12".' },
  selector: { type: 'string', description: 'CSS selector, only when no ref fits (main page only, not inside frames).' },
};

function targetOf(args = {}) {
  const ref = typeof args.ref === 'string' && args.ref.trim() ? args.ref.trim() : undefined;
  const selector = typeof args.selector === 'string' && args.selector.trim() ? args.selector.trim() : undefined;
  return { ref, selector };
}

function needsTarget(args) {
  const { ref, selector } = targetOf(args);
  return ref || selector ? null : { success: false, error: 'Say which element: pass a ref from preview_snapshot (or a CSS selector).' };
}

/** Open the browser panel on this tab, when the user has the chat open. */
function showInPanel(context, result) {
  if (typeof context?.emitEvent !== 'function' || !result?.tabId) return;
  context.emitEvent({ type: 'preview_url', data: { url: result.url || '', title: result.title || result.url || '', tabId: result.tabId } });
}

async function command(action, params, context, timeoutMs) {
  try {
    return await sendBrowserCommand(action, params, context, { timeoutMs });
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

export const previewBrowserTools = [
  {
    name: 'preview_navigate',
    description: `Open a web page in Asyncat's built-in browser, in your own tab (created if needed), and wait for it to load. The user can watch in the Browser panel.
Your tabs use the user's Standard browser profile, so sites they signed in to there are signed in for you too.
Then read the page with preview_snapshot.`,
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL, e.g. https://example.com or http://localhost:5173/about' },
      },
      required: ['url'],
    },
    async execute({ url: requestedUrl }, context) {
      const check = await checkAgentUrl(requestedUrl);
      if (!check.ok) return { success: false, error: check.reason };
      const result = await command('navigate', { url: check.url }, context, 40_000);
      if (result?.success) showInPanel(context, result);
      return result;
    },
  },

  {
    name: 'preview_go_back',
    description: 'Go back (or forward) in your browser tab\'s history.',
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: { forward: { type: 'boolean', description: 'Go forward instead of back.' } },
    },
    async execute({ forward } = {}, context) {
      return command(forward ? 'forward' : 'back', {}, context, 25_000);
    },
  },

  {
    name: 'preview_snapshot',
    description: `Read the page in your browser tab as an outline of its elements (from the accessibility tree), frames included:
  [e12] button "Sign in"
  [e13] textbox "Email" value="ann@example.com" required
  [e14] link "Pricing" → /pricing
Pass refs like e12 to preview_click, preview_type, preview_select_option, preview_hover or preview_screenshot. Refs last until the next snapshot or until the page changes; take a new snapshot after navigating.
Long pages come in parts: when "truncated" is true, call again with offset = nextOffset.`,
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'Line to start from (default 0 = a fresh snapshot).' },
        limit: { type: 'number', description: 'Most lines to return (default 400).' },
      },
    },
    async execute({ offset = 0, limit = 400 } = {}, context) {
      return command('snapshot', { offset, limit }, context, 30_000);
    },
  },

  {
    name: 'preview_get_text',
    description: `Get the visible text of the page in your browser tab, in parts of about 12,000 characters. When "truncated" is true, call again with offset = nextOffset.
Use preview_snapshot instead when you need to act on elements.`,
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'Character to start from (default 0).' },
        limit: { type: 'number', description: 'Most characters to return (default 12000).' },
      },
    },
    async execute({ offset = 0, limit = 12000 } = {}, context) {
      return command('get_text', { offset, limit }, context, 20_000);
    },
  },

  {
    name: 'preview_screenshot',
    description: `Take a screenshot of your browser tab (what is in view), of one element (ref), or of the whole page. You see the image.
Use it when the look matters (layout, images, charts, visual bugs); for reading and acting, preview_snapshot is faster and more precise.`,
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        ...TARGET_PROPS,
        full_page: { type: 'boolean', description: 'Capture the whole page, not just what is in view.' },
      },
    },
    async execute(args = {}, context) {
      const params = { ...targetOf(args), fullPage: Boolean(args.full_page) };
      let result = await command('screenshot', params, context, 30_000);
      if (result?.success === false && /not on screen/i.test(result.error || '') && typeof context?.emitEvent === 'function') {
        // Open the panel on the tab (if the user has the chat open), then retry.
        const tabs = await command('list_tabs', {}, context, 5_000);
        const mine = tabs?.tabs?.find((tab) => tab.yours);
        if (mine) {
          showInPanel(context, mine);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          result = await command('screenshot', params, context, 30_000);
        }
      }
      return result;
    },
  },

  {
    name: 'preview_click',
    description: `Click an element in your browser tab with a real mouse click. Pass a ref from preview_snapshot (or a CSS selector).
Clicks that may buy, delete, send or upload something ask the user first. If something covers the element (a cookie banner, a dialog), you get an error saying what: deal with that first.
The result says whether the page changed (navigated) and whether a new tab or window opened.`,
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        ...TARGET_PROPS,
        double: { type: 'boolean', description: 'Double-click.' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default left).' },
      },
    },
    async execute(args = {}, context) {
      const missing = needsTarget(args);
      if (missing) return missing;
      return runBrowserAction('click', { ...targetOf(args), double: Boolean(args.double), button: args.button }, context, {
        toolName: 'preview_click', args, timeoutMs: 40_000,
      });
    },
  },

  {
    name: 'preview_hover',
    description: 'Move the mouse over an element (to open a hover menu or tooltip). Pass a ref from preview_snapshot.',
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: { type: 'object', properties: { ...TARGET_PROPS } },
    async execute(args = {}, context) {
      const missing = needsTarget(args);
      if (missing) return missing;
      return command('hover', targetOf(args), context, 20_000);
    },
  },

  {
    name: 'preview_type',
    description: `Type text into a field in your browser tab (real keyboard input). Pass a ref from preview_snapshot. The field is cleared first unless clear is false; submit presses Enter afterwards.
Typing into password, card or one-time-code fields always asks the user. Never guess passwords: for sign-ins, use preview_ask_user so the user types them.`,
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        ...TARGET_PROPS,
        text: { type: 'string', description: 'The text to type.' },
        clear: { type: 'boolean', description: 'Clear the field first (default true).' },
        submit: { type: 'boolean', description: 'Press Enter after typing (default false).' },
      },
      required: ['text'],
    },
    async execute(args = {}, context) {
      const missing = needsTarget(args);
      if (missing) return missing;
      return runBrowserAction('type', { ...targetOf(args), text: String(args.text ?? ''), clear: args.clear !== false, submit: Boolean(args.submit) }, context, {
        toolName: 'preview_type', args, timeoutMs: 40_000,
      });
    },
  },

  {
    name: 'preview_fill',
    description: 'Fill a field in your browser tab: the same as preview_type with clear. Prefer preview_type with a ref.',
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        ...TARGET_PROPS,
        value: { type: 'string', description: 'The value to put in the field.' },
      },
      required: ['value'],
    },
    async execute(args = {}, context) {
      const missing = needsTarget(args);
      if (missing) return missing;
      return runBrowserAction('type', { ...targetOf(args), text: String(args.value ?? ''), clear: true }, context, {
        toolName: 'preview_fill', args, timeoutMs: 40_000,
      });
    },
  },

  {
    name: 'preview_press_key',
    description: `Press a key or shortcut in your browser tab: Enter, Tab, Escape, Backspace, ArrowDown, PageDown, or combos like Control+A or Shift+Tab. With a ref, that element gets focus first.`,
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name or combo, e.g. "Enter", "Control+A".' },
        ...TARGET_PROPS,
        repeat: { type: 'number', description: 'Press it this many times (default 1, at most 50).' },
      },
      required: ['key'],
    },
    async execute(args = {}, context) {
      return runBrowserAction('press_key', { key: String(args.key || ''), ...targetOf(args), repeat: args.repeat }, context, {
        toolName: 'preview_press_key', args, timeoutMs: 40_000,
      });
    },
  },

  {
    name: 'preview_select_option',
    description: 'Choose option(s) in a drop-down list (<select>) by their label or value. Pass the list\'s ref (a combobox in the snapshot). For custom menus, click instead.',
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        ...TARGET_PROPS,
        values: { type: 'array', items: { type: 'string' }, description: 'Labels or values to choose (one, unless the list allows several).' },
      },
      required: ['values'],
    },
    async execute(args = {}, context) {
      const missing = needsTarget(args);
      if (missing) return missing;
      const values = Array.isArray(args.values) ? args.values.map(String) : [String(args.values)];
      return runBrowserAction('select_option', { ...targetOf(args), values }, context, {
        toolName: 'preview_select_option', args, timeoutMs: 30_000,
      });
    },
  },

  {
    name: 'preview_scroll',
    description: 'Scroll the page in your browser tab up or down by some pixels, or bring an element (ref) into view.',
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Direction to scroll (default down).' },
        amount: { type: 'number', description: 'Pixels to scroll (default 600).' },
        ...TARGET_PROPS,
      },
    },
    async execute(args = {}, context) {
      return command('scroll', { direction: args.direction || 'down', amount: args.amount, ...targetOf(args) }, context, 15_000);
    },
  },

  {
    name: 'preview_evaluate',
    description: `Run JavaScript in the page of your browser tab and return the result (JSON, at most 4000 characters).
Only for what the other preview tools can't do; it asks the user first.`,
    category: 'browser',
    permission: PermissionLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript expression or IIFE to evaluate in the page.' },
      },
      required: ['code'],
    },
    async execute({ code }, context) {
      return command('evaluate', { code }, context, 20_000);
    },
  },

  {
    name: 'preview_wait_for_reload',
    description: `Wait for the page in your browser tab to reload (up to 30 s), e.g. after editing files while a dev server with hot reload runs.
Loop: preview_screenshot → edit files → preview_wait_for_reload → preview_screenshot.`,
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: { type: 'object', properties: {} },
    async execute(_args, context) {
      return command('wait_for_reload', {}, context, 35_000);
    },
  },

  {
    name: 'preview_list_tabs',
    description: 'List the browser\'s tabs and pop-up windows: index, title, URL, which one is yours (the tab the preview tools act on) and which the user is looking at.',
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: { type: 'object', properties: {} },
    async execute(_args, context) {
      return command('list_tabs', {}, context, 8_000);
    },
  },

  {
    name: 'preview_open_tab',
    description: 'Open a new tab of your own in the browser, optionally at a URL. It becomes the tab the preview tools act on.',
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL to open (optional).' } },
    },
    async execute({ url } = {}, context) {
      let target = '';
      if (url) {
        const check = await checkAgentUrl(url);
        if (!check.ok) return { success: false, error: check.reason };
        target = check.url;
      }
      const result = await command('open_tab', { url: target }, context, 40_000);
      if (result?.success) showInPanel(context, result);
      return result;
    },
  },

  {
    name: 'preview_switch_tab',
    description: 'Make another tab (or pop-up window) the one the preview tools act on, by index from preview_list_tabs or by part of its URL.',
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'number', description: '0-based index from preview_list_tabs.' },
        url: { type: 'string', description: 'Part of the tab\'s URL (used when no index is given).' },
      },
    },
    async execute({ index, url } = {}, context) {
      const result = await command('switch_tab', { index: Number.isInteger(index) ? index : undefined, url: url || undefined }, context, 8_000);
      if (result?.success) showInPanel(context, result);
      return result;
    },
  },

  {
    name: 'preview_close_tab',
    description: 'Close one of your browser tabs (by index from preview_list_tabs; default: your current tab). Tabs the user opened stay open.',
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: { index: { type: 'number', description: '0-based index from preview_list_tabs.' } },
    },
    async execute({ index } = {}, context) {
      return command('close_tab', { index: Number.isInteger(index) ? index : undefined }, context, 8_000);
    },
  },

  {
    name: 'preview_ask_user',
    description: `Hand the page in your browser tab to the user and wait until they press Continue: for signing in, captchas, two-factor codes, or anything only they should do.
They see a banner with your message (and a desktop notification if Asyncat's window isn't open). Never type passwords for the user. Afterwards take a new preview_snapshot.`,
    category: 'browser',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'What the user should do, e.g. "Sign in to your GitHub account."' },
        timeout_seconds: { type: 'number', description: 'How long to wait (default 300, at most 900).' },
      },
      required: ['message'],
    },
    async execute({ message, timeout_seconds: timeoutSeconds } = {}, context) {
      const timeoutMs = Math.max(30, Math.min(Number(timeoutSeconds) || 300, 900)) * 1000;
      const text = String(message || '').trim() || 'Finish this step in the browser.';
      const started = await command('handover_start', { message: text, timeoutMs }, context, 10_000);
      if (!started?.success) return started;
      showInPanel(context, { tabId: started.tabId });
      if (!started.windowVisible) {
        sendToHost('notify', {
          title: 'Asyncat needs you in the browser',
          body: text,
          ...(started.route ? { route: started.route } : {}),
        });
      }
      return command('handover_wait', { handoverId: started.handoverId }, context, timeoutMs + 15_000);
    },
  },
];
