// den/src/agent/tools/previewBrowserTools.js
// ─── Live Preview Browser Tools ───────────────────────────────────────────────
//
// These tools let the agent control the VISIBLE preview webview in the
// Asyncat desktop UI — the user can watch the agent click, fill forms, and
// take screenshots in real-time instead of using an invisible headless browser.
//
// Architecture:
//  1. Tool calls execBrowserCommand(action, params, context)
//  2. That emits a `browser_command` SSE event to the frontend
//  3. Frontend executes the action on the live <webview> element
//  4. Frontend POSTs the result to POST /api/agent/browser/result/:commandId
//  5. Den's route handler calls resolveBrowserCommand() → tool's await resolves

import { randomUUID } from 'crypto';
import { PermissionLevel } from './toolRegistry.js';
import { registerBrowserCommand } from '../browserCommandQueue.js';

/**
 * Emit a browser_command SSE event and wait for the frontend to POST the result.
 */
async function execBrowserCommand(action, params, context, timeoutMs = 15000) {
  if (typeof context?.emitEvent !== 'function') {
    return { success: false, error: 'preview browser tools require a live streaming agent run' };
  }

  const commandId = `browser_${randomUUID()}`;
  context.emitEvent({ type: 'browser_command', data: { commandId, action, ...params } });

  return registerBrowserCommand(commandId, timeoutMs);
}

export const previewBrowserTools = [
  // ── Navigation ────────────────────────────────────────────────────────────
  {
    name: 'preview_navigate',
    description: `Navigate the visible Preview panel in the Asyncat UI to a URL.
Opens the Preview tab if it is not already open. The user can see the page loading in real-time.
Use this before click/fill/screenshot tools to make sure the right page is loaded.
Prefers localhost URLs for dev servers started by the agent.`,
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to navigate to, e.g. http://localhost:4321/about' },
      },
      required: ['url'],
    },
    async execute({ url }, context) {
      // preview_url event opens the Preview tab and loads the URL via React state
      if (typeof context?.emitEvent === 'function') {
        context.emitEvent({ type: 'preview_url', data: { url, title: url } });
      }
      // Give React time to render the tab and mount the webview (~1s)
      await new Promise(r => setTimeout(r, 1000));
      return { success: true, url, message: `Preview navigated to ${url}` };
    },
  },

  // ── Screenshot ────────────────────────────────────────────────────────────
  {
    name: 'preview_screenshot',
    description: `Take a screenshot of whatever is currently visible in the Preview panel.
Returns a base64 PNG image. Much faster than headless browser tools and shows the actual
rendered state including animations, fonts, and CSS — exactly what the user sees.
Call preview_navigate first if you need a specific page loaded.`,
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    async execute(_params, context) {
      return execBrowserCommand('screenshot', {}, context, 10000);
    },
  },

  // ── Click ─────────────────────────────────────────────────────────────────
  {
    name: 'preview_click',
    description: `Click an element in the visible Preview panel by CSS selector.
The click happens in the real webview — the user can see it happen.
Returns information about the element that was clicked.`,
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click, e.g. "button.submit", "#login-btn", "nav a[href=\'/about\']"',
        },
      },
      required: ['selector'],
    },
    async execute({ selector }, context) {
      return execBrowserCommand('click', { selector }, context);
    },
  },

  // ── Fill ──────────────────────────────────────────────────────────────────
  {
    name: 'preview_fill',
    description: `Fill an input field in the visible Preview panel.
Dispatches input and change events so React/Vue/Svelte state updates correctly.`,
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the input/textarea element' },
        value:    { type: 'string', description: 'Value to type into the field' },
      },
      required: ['selector', 'value'],
    },
    async execute({ selector, value }, context) {
      return execBrowserCommand('fill', { selector, value }, context);
    },
  },

  // ── Get page text ─────────────────────────────────────────────────────────
  {
    name: 'preview_get_text',
    description: `Get the visible text content of the page currently shown in the Preview panel.
Useful for verifying the page renders the right content without taking a full screenshot.`,
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    async execute(_params, context) {
      return execBrowserCommand('get_text', {}, context);
    },
  },

  // ── Evaluate JavaScript ───────────────────────────────────────────────────
  {
    name: 'preview_evaluate',
    description: `Run JavaScript in the Preview panel's page context and return the result.
Useful for reading DOM state, checking JavaScript variables, or triggering actions
that don't have a simple CSS selector. Result is JSON-serialised (max 4000 chars).`,
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript expression or IIFE to evaluate in the page context' },
      },
      required: ['code'],
    },
    async execute({ code }, context) {
      return execBrowserCommand('evaluate', { code }, context);
    },
  },
];
