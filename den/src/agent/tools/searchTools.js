// den/src/agent/tools/searchTools.js
// ─── Web Search Tools ────────────────────────────────────────────────────────
// Wraps the existing webSearch.js (DuckDuckGo + SearXNG) for agent use.

import { PermissionLevel } from './toolRegistry.js';

export const webSearchTool = {
  name: 'web_search',
  description: 'Search the web for information. Returns search results with titles, URLs, and page content from top results. Use for current events, documentation, or any factual lookup.',
  category: 'search',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      max_results: { type: 'number', description: 'Maximum results (default: 5)' },
      include_images: { type: 'boolean', description: 'Include image results (default: false)' },
    },
    required: ['query'],
  },
  execute: async (args) => {
    try {
      const { searchWeb } = await import('../../ai/controllers/ai/webSearch.js');
      const results = await searchWeb(args.query, args.max_results || 5, args.include_images || false);
      // Slim results for agent consumption
      const formatted = results.results.map((r, i) => ({
        index: i + 1,
        title: r.title,
        url: r.url,
        snippet: r.snippet || '',
        content: r.content ? r.content.slice(0, 3000) : null,
      }));
      return {
        success: true,
        query: args.query,
        engine: results.engine,
        count: formatted.length,
        results: formatted,
        images: results.images?.slice(0, 4) || [],
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const fetchUrlTool = {
  name: 'fetch_url',
  description: 'Fetch and read the content of a specific URL. Extracts readable text from web pages (like reader mode). Use when you have a specific URL to read.',
  category: 'search',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
    },
    required: ['url'],
  },
  execute: async (args) => {
    try {
      const res = await fetch(args.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });

      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/html') && !ct.includes('text/plain') && !ct.includes('application/json')) {
        return { success: false, error: `Non-text content type: ${ct}` };
      }

      let body = await res.text();

      if (ct.includes('application/json')) {
        return { success: true, url: args.url, content_type: 'json', content: body.slice(0, 8000) };
      }

      // Extract readable text from HTML
      body = body
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

      const article = body.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
      const main = body.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      const bodyTag = body.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      let text = (article || main || bodyTag)?.[1] || body;
      text = text
        .replace(/<\/?(h[1-6]|p|li|div|section|tr|br)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .split('\n').map(l => l.trim()).filter(l => l.length > 20).join('\n')
        .replace(/\n{3,}/g, '\n\n').trim();

      if (text.length > 8000) text = text.slice(0, 8000) + '\n... [truncated]';

      return { success: true, url: args.url, content_type: 'html', content: text || 'No readable content extracted.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};


// ── http_request ─────────────────────────────────────────────────────────────
export const httpRequestTool = {
  name: 'http_request',
  description: 'Make a full HTTP request (GET, POST, PUT, PATCH, DELETE) to any URL. Supports custom headers, JSON/text body, Bearer auth, and returns status code + response body. Use for calling APIs, submitting data, or any interaction beyond reading a page.',
  category: 'search',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      url:     { type: 'string',  description: 'The URL to call' },
      method:  { type: 'string',  enum: ['GET','POST','PUT','PATCH','DELETE','HEAD'], description: 'HTTP method (default: GET)' },
      headers: { type: 'object',  description: 'Optional key-value headers, e.g. { "Authorization": "Bearer ..." }' },
      body:    { type: 'object',  description: 'Request body (will be JSON-serialised). Only for POST/PUT/PATCH.' },
      body_text: { type: 'string', description: 'Raw string body. Use instead of body when sending non-JSON.' },
      auth_token: { type: 'string', description: 'Bearer token — sets Authorization: Bearer <token> header.' },
      timeout: { type: 'number',  description: 'Timeout in seconds (default: 15)' },
    },
    required: ['url'],
  },
  execute: async (args) => {
    try {
      const method  = (args.method || 'GET').toUpperCase();
      const timeout = (args.timeout || 15) * 1000;
      const headers = { ...(args.headers || {}) };

      if (args.auth_token) {
        headers['Authorization'] = `Bearer ${args.auth_token}`;
      }

      let bodyContent;
      if (args.body && method !== 'GET' && method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
        bodyContent = JSON.stringify(args.body);
      } else if (args.body_text) {
        bodyContent = args.body_text;
      }

      const res = await fetch(args.url, {
        method,
        headers,
        body: bodyContent,
        signal: AbortSignal.timeout(timeout),
        redirect: 'follow',
      });

      const ct = res.headers.get('content-type') || '';
      let responseBody;
      if (ct.includes('application/json')) {
        const json = await res.json().catch(() => null);
        responseBody = json;
      } else {
        const text = await res.text();
        responseBody = text.slice(0, 8000);
      }

      // Collect response headers
      const responseHeaders = {};
      res.headers.forEach((v, k) => { responseHeaders[k] = v; });

      return {
        success: res.ok,
        status:  res.status,
        status_text: res.statusText,
        headers: responseHeaders,
        body: responseBody,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const searchTools = [webSearchTool, fetchUrlTool, httpRequestTool];
export default searchTools;
