// den/src/agent/tools/lspTools.js
// ─── LSP Tool Module ────────────────────────────────────────────────────────
// Exposes compiler-accurate navigation (lsp_find_definition, lsp_find_references)
// using spawned background language servers.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { lspManager } from '../LspManager.js';
import { PermissionLevel } from './toolRegistry.js';
import { safePath } from './shared.js';

function detectLspLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    return 'typescript';
  }
  if (['.py'].includes(ext)) {
    return 'python';
  }
  if (['.go'].includes(ext)) {
    return 'go';
  }
  if (['.rs'].includes(ext)) {
    return 'rust';
  }
  if (['.html'].includes(ext)) {
    return 'html';
  }
  if (['.css'].includes(ext)) {
    return 'css';
  }
  return null;
}

function uriToRelativePath(uri, workspaceRoot) {
  try {
    const absolute = fileURLToPath(uri);
    return path.relative(workspaceRoot, absolute);
  } catch {
    // Fallback parsing for raw file:/// uris
    let cleaned = uri.replace(/^file:\/\//, '');
    if (process.platform === 'win32') {
      cleaned = cleaned.replace(/^\/([a-zA-Z]):/, '$1:');
    }
    return path.relative(workspaceRoot, cleaned);
  }
}

export const lspFindDefinitionTool = {
  name: 'lsp_find_definition',
  description: 'Find the compiler-accurate definition location of a symbol (function, class, variable, import) at a specific line and character position. Uses running language servers.',
  category: 'code',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to working directory' },
      line: { type: 'number', description: '1-indexed line number where the symbol resides' },
      character: { type: 'number', description: '1-indexed character column offset of the symbol' },
    },
    required: ['path', 'line', 'character'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${args.path}` };
    }

    const language = detectLspLanguage(filePath);
    if (!language) {
      return { success: false, error: `Unsupported LSP file type: ${args.path}` };
    }

    try {
      const client = await lspManager.getClient(language, context.workspaceRoot);
      const text = fs.readFileSync(filePath, 'utf8');

      // Make sure the server knows about the current file content
      client.notifyDidOpen(filePath, text);

      // LSP coordinates are 0-indexed
      const result = await client.sendRequest('textDocument/definition', {
        textDocument: { uri: `file://${filePath}` },
        position: {
          line: args.line - 1,
          character: args.character - 1
        }
      });

      if (!result || (Array.isArray(result) && result.length === 0)) {
        return { success: true, message: 'No definition found at this position.' };
      }

      const locations = Array.isArray(result) ? result : [result];
      const parsed = locations.map(loc => {
        // LocationLink has targetUri, Location has uri
        const uri = loc.uri || loc.targetUri;
        const range = loc.range || loc.targetSelectionRange;
        const relPath = uriToRelativePath(uri, context.workspaceRoot);
        
        return {
          file: relPath,
          start_line: range.start.line + 1,
          start_character: range.start.character + 1,
          end_line: range.end.line + 1,
          end_character: range.end.character + 1
        };
      });

      return {
        success: true,
        definitions: parsed
      };
    } catch (err) {
      return { success: false, error: `LSP definition error: ${err.message}` };
    }
  }
};

export const lspFindReferencesTool = {
  name: 'lsp_find_references',
  description: 'Find all compiler-accurate usages and references of a symbol (function, class, variable, method) across the codebase. Uses language servers to avoid false positives.',
  category: 'code',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to working directory' },
      line: { type: 'number', description: '1-indexed line number where the symbol resides' },
      character: { type: 'number', description: '1-indexed character column offset of the symbol' },
    },
    required: ['path', 'line', 'character'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${args.path}` };
    }

    const language = detectLspLanguage(filePath);
    if (!language) {
      return { success: false, error: `Unsupported LSP file type: ${args.path}` };
    }

    try {
      const client = await lspManager.getClient(language, context.workspaceRoot);
      const text = fs.readFileSync(filePath, 'utf8');
      
      client.notifyDidOpen(filePath, text);

      const result = await client.sendRequest('textDocument/references', {
        textDocument: { uri: `file://${filePath}` },
        position: {
          line: args.line - 1,
          character: args.character - 1
        },
        context: { includeDeclaration: true }
      });

      if (!result || !Array.isArray(result) || result.length === 0) {
        return { success: true, message: 'No references found.' };
      }

      const parsed = result.map(loc => {
        const relPath = uriToRelativePath(loc.uri, context.workspaceRoot);
        return {
          file: relPath,
          start_line: loc.range.start.line + 1,
          start_character: loc.range.start.character + 1,
          end_line: loc.range.end.line + 1,
          end_character: loc.range.end.character + 1
        };
      });

      return {
        success: true,
        references: parsed
      };
    } catch (err) {
      return { success: false, error: `LSP references error: ${err.message}` };
    }
  }
};

export const lspTools = [lspFindDefinitionTool, lspFindReferencesTool];
export default lspTools;
