// den/src/agent/tools/previewTool.js
// ─── Preview Panel Tool ───────────────────────────────────────────────────────
// Lets the agent signal the frontend to open the built-in preview panel at a
// given URL. Emits a `preview_url` SSE event that CommandCenterV2Enhanced
// picks up and uses to switch to the Preview tab.

import { PermissionLevel } from './toolRegistry.js';

export const openPreviewTool = {
  name: 'open_preview',
  description: 'Open the built-in preview panel in the Asyncat UI at a given localhost URL. Use this after starting a dev server so the user can see the running site without leaving the app. The panel shows a live interactive webview, not a screenshot.',
  category: 'desktop',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The localhost URL to preview (e.g. http://localhost:3000). Must start with http://localhost or http://127.0.0.1.',
      },
      title: {
        type: 'string',
        description: 'Optional label to show the user (e.g. "Astro dev server").',
      },
    },
    required: ['url'],
  },
  async execute({ url, title }, context) {
    if (!url || !url.match(/^https?:\/\/(localhost|127\.0\.0\.1)/)) {
      return { success: false, error: 'URL must be a localhost address.' };
    }
    // Emit a preview_url SSE event so the frontend opens the panel.
    // context.emitEvent is wired by AgentRuntime from this.onEvent.
    if (typeof context?.emitEvent === 'function') {
      context.emitEvent({ type: 'preview_url', data: { url, title: title || url } });
    }
    return { success: true, url, message: `Preview panel opened at ${url}` };
  },
};

export const previewTools = [openPreviewTool];
