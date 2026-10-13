// A small MCP server for tests (den's connector tests and npm run test:e2e),
// so connectors can be tried without downloading a real one. Run directly it
// talks over stdin/stdout; buildFakeServer() gives the same server for an
// HTTP test.
//
// Tools: echo (read-only), add_note (adds, inside the service), wipe_notes
// (says nothing about itself, so it counts as dangerous), picture (returns
// an image), fail (returns an error), env_check (what it can see of its
// environment), add_tool (adds late_tool, so the tool list changes).

import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// A 1×1 PNG.
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function buildFakeServer({ name = 'fake-notes' } = {}) {
  const server = new McpServer({ name, version: '1.0.0' });
  const notes = [];

  server.registerTool('echo', {
    description: 'Repeat the text back.',
    inputSchema: { text: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ text }) => ({ content: [{ type: 'text', text: `echo: ${text}` }] }));

  server.registerTool('add_note', {
    description: 'Save a note in the fake notebook.',
    inputSchema: { note: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ note }) => {
    notes.push(note);
    return { content: [{ type: 'text', text: `saved note ${notes.length}: ${note}` }] };
  });

  server.registerTool('wipe_notes', {
    description: 'Delete every note.',
    inputSchema: {},
  }, async () => {
    notes.length = 0;
    return { content: [{ type: 'text', text: 'all notes deleted' }] };
  });

  server.registerTool('picture', {
    description: 'Return a tiny picture.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => ({ content: [{ type: 'text', text: 'here it is' }, { type: 'image', data: PIXEL, mimeType: 'image/png' }] }));

  server.registerTool('fail', {
    description: 'Always fails.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => ({ isError: true, content: [{ type: 'text', text: 'it broke on purpose' }] }));

  server.registerTool('env_check', {
    description: 'Report what this server can see of its environment.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => ({
    content: [{
      type: 'text',
      text: JSON.stringify({
        hostToken: Boolean(process.env.ASYNCAT_HOST_TOKEN),
        secretKey: Boolean(process.env.ASYNCAT_SECRET_KEY),
        fakeKey: process.env.FAKE_KEY || null,
        offline: process.env.npm_config_offline || null,
      }),
    }],
  }));

  server.registerTool('add_tool', {
    description: 'Add another tool, late_tool.',
    inputSchema: {},
  }, async () => {
    server.registerTool('late_tool', { description: 'Added later.', inputSchema: {}, annotations: { readOnlyHint: true } },
      async () => ({ content: [{ type: 'text', text: 'late' }] }));
    return { content: [{ type: 'text', text: 'added late_tool' }] };
  });

  return server;
}

/** Serve over stdin/stdout. */
export async function runStdio() {
  const server = buildFakeServer({ name: process.env.FAKE_MCP_NAME || 'fake-notes' });
  await server.connect(new StdioServerTransport());
  console.error('fake MCP server ready');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runStdio();
