// den/src/agent/tools/searchTools.js
// ─── Web Search Tools ────────────────────────────────────────────────────────
// Wraps the local DuckDuckGo search helper for agent use.

import { PermissionLevel } from './toolRegistry.js';

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripChrome(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function extractSelector(html, selector) {
  if (!selector) return null;
  const raw = String(selector).trim();
  if (!raw) return null;

  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (raw.startsWith('#')) {
    const id = raw.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.match(new RegExp(`<([a-z0-9-]+)[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'))?.[2] || null;
  }
  if (raw.startsWith('.')) {
    const cls = raw.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.match(new RegExp(`<([a-z0-9-]+)[^>]*\\bclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'))?.[2] || null;
  }
  if (/^[a-z][a-z0-9-]*$/i.test(raw)) {
    return html.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'))?.[1] || null;
  }
  return null;
}

function extractReadableText(html, selector = null) {
  let body = stripChrome(html);
  const selected = extractSelector(body, selector);
  if (selected) body = selected;
  else {
    const article = body.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const main = body.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const bodyTag = body.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    body = (article || main || bodyTag)?.[1] || body;
  }

  const text = decodeEntities(body)
    .replace(/<\/?(h[1-6]|p|li|div|section|article|main|tr|br|blockquote|pre)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return text || 'No readable content extracted.';
}

async function fetchTextUrl(url, timeoutMs = 10000) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/json;q=0.7,*/*;q=0.5',
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) return { success: false, status: res.status, statusText: res.statusText, contentType };
  if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/json')) {
    return { success: false, status: res.status, statusText: res.statusText, contentType, error: `Non-text content type: ${contentType}` };
  }
  return { success: true, status: res.status, statusText: res.statusText, contentType, body: await res.text(), finalUrl: res.url };
}

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
      const { searchWeb } = await import('./webSearch.js');
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
      const fetched = await fetchTextUrl(args.url, 10000);
      if (!fetched.success) return { success: false, error: fetched.error || `HTTP ${fetched.status}` };

      if (fetched.contentType.includes('application/json')) {
        return { success: true, url: fetched.finalUrl || args.url, content_type: 'json', content: fetched.body.slice(0, 8000) };
      }

      let text = fetched.contentType.includes('text/html')
        ? extractReadableText(fetched.body)
        : fetched.body.trim();

      if (text.length > 8000) text = text.slice(0, 8000) + '\n... [truncated]';

      return { success: true, url: fetched.finalUrl || args.url, content_type: fetched.contentType.includes('text/html') ? 'html' : 'text', content: text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const httpGetTool = {
  name: 'http_get',
  description: 'Fetch a URL and return cleaned readable text without launching a browser. Optionally extract a simple selector (#id, .class, or tag). Use browser tools for JS-heavy pages.',
  category: 'search',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch.' },
      selector: { type: 'string', description: 'Optional simple selector: #id, .class, or tag name.' },
      max_chars: { type: 'number', description: 'Maximum characters to return. Default 12000.' },
    },
    required: ['url'],
  },
  execute: async (args) => {
    try {
      const fetched = await fetchTextUrl(args.url, 12000);
      if (!fetched.success) return { success: false, error: fetched.error || `HTTP ${fetched.status}` };

      const maxChars = Math.max(1000, Math.min(50000, Number(args.max_chars || 12000)));
      let content;
      let contentType = 'text';
      if (fetched.contentType.includes('application/json')) {
        contentType = 'json';
        content = fetched.body;
      } else if (fetched.contentType.includes('text/html')) {
        contentType = 'html';
        content = extractReadableText(fetched.body, args.selector);
      } else {
        content = fetched.body.trim();
      }

      if (content.length > maxChars) content = `${content.slice(0, maxChars)}\n... [truncated]`;

      return {
        success: true,
        url: fetched.finalUrl || args.url,
        status: fetched.status,
        content_type: contentType,
        selector: args.selector || null,
        content,
      };
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

export const searchTools = [webSearchTool, fetchUrlTool, httpGetTool, httpRequestTool];
export default searchTools;
