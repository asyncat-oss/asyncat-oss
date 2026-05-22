// den/src/agent/tools/apiExplorerTools.js
// Static Express route mapper for living API maps.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { PermissionLevel } from './toolRegistry.js';
import { safePath, isPathInside, formatSize } from './shared.js';
import { getArtifactsDir } from '../workspacePaths.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function cleanRoutePath(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function joinRoute(base, route) {
  const left = cleanRoutePath(base);
  const right = cleanRoutePath(route);
  const joined = `${left}${right}`.replace(/\/{2,}/g, '/');
  return joined || '/';
}

function parseImports(source, filePath) {
  const imports = new Map();
  const re = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const spec = match[2];
    if (!spec.startsWith('.')) continue;
    let resolved = path.resolve(path.dirname(filePath), spec);
    if (!path.extname(resolved)) resolved += '.js';
    imports.set(match[1], resolved);
  }
  return imports;
}

function routeLiteralFromArgs(argsText) {
  const match = String(argsText || '').match(/^\s*['"`]([^'"`]+)['"`]/);
  return match?.[1] || null;
}

function middlewareNames(argsText) {
  const parts = String(argsText || '').split(',').map(part => part.trim()).filter(Boolean);
  return parts
    .slice(1, -1)
    .map(part => part.replace(/\([^)]*\)/g, '()').slice(0, 80))
    .filter(Boolean);
}

function lineFor(source, index) {
  return source.slice(0, index).split('\n').length;
}

function parseRouteFile(filePath, basePath, seen = new Set()) {
  const resolved = path.resolve(filePath);
  if (seen.has(resolved) || !fs.existsSync(resolved)) return [];
  seen.add(resolved);

  const source = readText(resolved);
  const imports = parseImports(source, resolved);
  const routes = [];

  const methodRe = /\b(?:router|app)\.(get|post|put|patch|delete|options|head)\s*\(([\s\S]*?)\);/g;
  let methodMatch;
  while ((methodMatch = methodRe.exec(source)) !== null) {
    const routePath = routeLiteralFromArgs(methodMatch[2]);
    if (routePath == null) continue;
    routes.push({
      method: methodMatch[1].toUpperCase(),
      path: joinRoute(basePath, routePath),
      localPath: cleanRoutePath(routePath) || '/',
      file: resolved,
      line: lineFor(source, methodMatch.index),
      middleware: middlewareNames(methodMatch[2]),
    });
  }

  const useRe = /\b(?:router|app)\.use\s*\(([\s\S]*?)\);/g;
  let useMatch;
  while ((useMatch = useRe.exec(source)) !== null) {
    const args = useMatch[1];
    const mount = routeLiteralFromArgs(args);
    const importedName = args.split(',').map(part => part.trim()).find(part => imports.has(part));
    if (!mount || !importedName) continue;
    const childPath = imports.get(importedName);
    if (!isPathInside(childPath, path.dirname(path.dirname(resolved))) && !isPathInside(childPath, process.cwd())) continue;
    routes.push(...parseRouteFile(childPath, joinRoute(basePath, mount), seen));
  }

  return routes;
}

function collectRouteFiles(root, maxFiles = 200) {
  const files = [];
  const stack = [root];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);
  while (stack.length && files.length < maxFiles) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) stack.push(full);
      } else if (entry.isFile() && /\.(js|mjs|cjs|ts)$/i.test(entry.name)) {
        const text = readText(full);
        if (/\brouter\.(get|post|put|patch|delete|use)\s*\(/.test(text)) files.push(full);
      }
    }
  }
  return files;
}

function markdownFor(routes, workingDir) {
  const sorted = [...routes].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  const rows = sorted.map(route => {
    const file = path.relative(workingDir, route.file);
    const middleware = route.middleware.length ? route.middleware.join(', ') : '';
    return `| ${route.method} | \`${route.path}\` | ${file}:${route.line} | ${middleware} |`;
  });
  return [
    '# API Endpoint Map',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Endpoints: ${sorted.length}`,
    '',
    '| Method | Path | Source | Middleware |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function methodCounts(routes) {
  const counts = {};
  for (const method of HTTP_METHODS.map(m => m.toUpperCase())) counts[method] = 0;
  for (const route of routes) counts[route.method] = (counts[route.method] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

export const mapApiEndpointsTool = {
  name: 'map_api_endpoints',
  description: 'Generate a living API endpoint map by statically walking Express app/router files. Useful for API exploration, backend audits, and handoff docs.',
  category: 'code',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      entry: { type: 'string', description: 'Entry file to start from. Default den/src/index.js if present.' },
      root: { type: 'string', description: 'Fallback folder to scan for route files. Default den/src.' },
      output_artifact: { type: 'boolean', description: 'Create a markdown artifact with the endpoint map. Default true.' },
      max_files: { type: 'number', description: 'Maximum route files to scan in fallback mode. Default 200.' },
    },
  },
  execute: async (args, context) => {
    try {
      const defaultEntry = fs.existsSync(path.join(context.workingDir, 'den/src/index.js')) ? 'den/src/index.js' : 'src/index.js';
      const entry = safePath(args.entry || defaultEntry, context.workingDir);
      const routes = [];

      if (fs.existsSync(entry)) {
        routes.push(...parseRouteFile(entry, ''));
      }

      if (!routes.length) {
        const root = safePath(args.root || 'den/src', context.workingDir);
        const files = collectRouteFiles(root, Math.max(20, Math.min(500, Number(args.max_files) || 200)));
        for (const file of files) routes.push(...parseRouteFile(file, ''));
      }

      const unique = new Map();
      for (const route of routes) {
        const key = `${route.method} ${route.path} ${route.file}:${route.line}`;
        unique.set(key, route);
      }
      const endpoints = [...unique.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
      const markdown = markdownFor(endpoints, context.workingDir);
      let artifact = null;

      if (args.output_artifact !== false) {
        const artifactsDir = getArtifactsDir(context.workingDir);
        fs.mkdirSync(artifactsDir, { recursive: true });
        const id = randomUUID().slice(0, 10);
        const filename = `api-endpoint-map_${id}.md`;
        const filePath = path.join(artifactsDir, filename);
        fs.writeFileSync(filePath, markdown, 'utf8');
        const stat = fs.statSync(filePath);
        artifact = {
          id,
          title: 'API Endpoint Map',
          filename,
          path: path.relative(context.workingDir, filePath),
          absolutePath: filePath,
          type: 'markdown',
          description: `${endpoints.length} discovered API endpoint${endpoints.length === 1 ? '' : 's'}`,
          size: stat.size,
          createdAt: new Date().toISOString(),
        };
      }

      return {
        success: true,
        count: endpoints.length,
        methodCounts: methodCounts(endpoints),
        endpoints: endpoints.slice(0, 250).map(route => ({
          method: route.method,
          path: route.path,
          file: path.relative(context.workingDir, route.file),
          line: route.line,
          middleware: route.middleware,
        })),
        truncated: endpoints.length > 250,
        artifact,
        message: artifact
          ? `Mapped ${endpoints.length} endpoint(s); artifact ${artifact.path} (${formatSize(artifact.size)}).`
          : `Mapped ${endpoints.length} endpoint(s).`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const apiExplorerTools = [mapApiEndpointsTool];

export default apiExplorerTools;
