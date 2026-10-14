// den/src/agent/tools/astTools.js
// ─── AST Code Analysis Tools ────────────────────────────────────────────────
// ast_get_node reads one function or class by name: JS/TS AST parsing via
// @babel/parser, Python AST parsing via Python standard lib, and fallback
// regex parsers for other languages (Go, Rust, Ruby, Java, C++).

import fs from 'fs';
import path from 'path';
import * as parser from '@babel/parser';
import { PermissionLevel } from './toolRegistry.js';
import { runFile, safePath } from './shared.js';

// Helper: Traverse Babel AST
function traverse(node, callbacks) {
  if (!node) return;
  
  if (callbacks[node.type]) {
    callbacks[node.type](node);
  }

  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      if (Array.isArray(node[key])) {
        for (const child of node[key]) {
          if (child && typeof child.type === 'string') {
            traverse(child, callbacks);
          }
        }
      } else if (typeof node[key].type === 'string') {
        traverse(node[key], callbacks);
      }
    }
  }
}

// Helper: Try to parse file with Babel (JS/TS/JSX/TSX support)
function parseCode(code) {
  try {
    return parser.parse(code, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        'classProperties',
        'decorators-legacy',
        'dynamicImport',
        'exportDefaultFrom',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
    });
  } catch (err) {
    try {
      return parser.parse(code, { sourceType: 'module' });
    } catch {
      throw new Error(`AST Parse Error: ${err.message}`);
    }
  }
}

// Inline Python AST script
const PYTHON_AST_SCRIPT = `
import ast, json, sys
def get_outline(node, parent_type=None):
    results = []
    for child in ast.iter_child_nodes(node):
        if isinstance(child, ast.ClassDef):
            results.append({
                'type': 'class',
                'name': child.name,
                'start': child.lineno,
                'end': getattr(child, 'end_lineno', child.lineno)
            })
            results.extend(get_outline(child, 'class'))
        elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
            results.append({
                'type': 'method' if parent_type == 'class' else 'function',
                'name': child.name,
                'start': child.lineno,
                'end': getattr(child, 'end_lineno', child.lineno)
            })
    return results
try:
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        code = f.read()
    tree = ast.parse(code)
    print(json.dumps({'success': True, 'outline': get_outline(tree)}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
`;

// Helper: Fallback Regex Outline for unsupported languages
export function fallbackRegexOutline(code, ext) {
  const lines = code.split('\n');
  const outline = [];
  
  const goFnRegex = /^\s*func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/;
  const goTypeRegex = /^\s*type\s+(\w+)\s+(?:struct|interface)/;

  const rustFnRegex = /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\b/;
  const rustStructRegex = /^\s*(?:pub\s+)?(?:struct|enum|trait|impl)\s+(\w+)\b/;

  const rubyFnRegex = /^\s*def\s+(\w+)\b/;
  const rubyClassRegex = /^\s*class\s+(\w+)\b/;

  const javaClassRegex = /^\s*(?:public\s+|private\s+)?(?:class|interface|enum)\s+(\w+)\b/;
  const javaMethodRegex = /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:[\w<>\[\]]+\s+)(\w+)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (ext === '.go') {
      let m = line.match(goTypeRegex);
      if (m) outline.push({ type: 'class', name: m[1], start: lineNum, end: lineNum });
      m = line.match(goFnRegex);
      if (m) outline.push({ type: 'function', name: m[1], start: lineNum, end: lineNum });
    } else if (ext === '.rs') {
      let m = line.match(rustStructRegex);
      if (m) outline.push({ type: 'class', name: m[1], start: lineNum, end: lineNum });
      m = line.match(rustFnRegex);
      if (m) outline.push({ type: 'function', name: m[1], start: lineNum, end: lineNum });
    } else if (ext === '.rb') {
      let m = line.match(rubyClassRegex);
      if (m) outline.push({ type: 'class', name: m[1], start: lineNum, end: lineNum });
      m = line.match(rubyFnRegex);
      if (m) outline.push({ type: 'function', name: m[1], start: lineNum, end: lineNum });
    } else if (['.java', '.cpp', '.h', '.hpp', '.cs'].includes(ext)) {
      let m = line.match(javaClassRegex);
      if (m) outline.push({ type: 'class', name: m[1], start: lineNum, end: lineNum });
      m = line.match(javaMethodRegex);
      if (m) outline.push({ type: 'method', name: m[1], start: lineNum, end: lineNum });
    }
  }

  return outline;
}

// Helper: Brace-matching block scanner
function getBraceScopedBlock(lines, startLineIdx) {
  let openCount = 0;
  let closedCount = 0;
  let started = false;
  let endLineIdx = startLineIdx;

  for (let i = startLineIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!started) {
      if (line.includes('{')) {
        started = true;
      }
    }
    
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    
    if (started) {
      openCount += openBraces;
      closedCount += closeBraces;
      if (openCount > 0 && openCount === closedCount) {
        endLineIdx = i;
        break;
      }
    }
  }
  return lines.slice(startLineIdx, endLineIdx + 1).join('\n');
}

/** Parse a Python file with the stdlib ast module, without a shell. */
function runPythonAst(filePath) {
  const res = runFile('python3', ['-', filePath], { input: PYTHON_AST_SCRIPT, timeout: 15000 });
  if (!res.ok) throw new Error(res.error);
  return res.stdout;
}

export const astGetNodeTool = {
  name: 'ast_get_node',
  description: 'Read the code of one function, class or method in a file you know, by name, with its line range (JS, TS, Python, Rust, Go, Java, Ruby, C++). To find which file defines a name, use find_definition (or lsp_find_definition from a usage); to see everything a file defines, list_definitions.',
  category: 'code',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to working directory' },
      name: { type: 'string', description: 'Name of the class, method, or function to retrieve' },
    },
    required: ['path', 'name'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${args.path}` };
    }

    const name = args.name.trim();
    const ext = path.extname(filePath).toLowerCase();
    const code = fs.readFileSync(filePath, 'utf8');
    const lines = code.split('\n');

    // 1. Javascript/TypeScript
    if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
      try {
        const ast = parseCode(code);
        let match = null;
        traverse(ast, {
          ClassDeclaration(node) { if (node.id && node.id.name === name) match = node; },
          FunctionDeclaration(node) { if (node.id && node.id.name === name) match = node; },
          ClassMethod(node) { if ((node.key.name === name || node.key.value === name) && !match) match = node; },
          VariableDeclarator(node) { if (node.id.type === 'Identifier' && node.id.name === name && node.init && (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')) match = node; },
        });
        if (!match) return { success: false, error: `Symbol "${name}" not found in AST.` };
        return { success: true, path: args.path, symbol: name, start_line: match.loc.start.line, end_line: match.loc.end.line, code: lines.slice(match.loc.start.line - 1, match.loc.end.line).join('\n') };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    // 2. Python
    if (ext === '.py') {
      try {
        const resultStr = runPythonAst(filePath);
        const result = JSON.parse(resultStr);
        if (!result.success) return { success: false, error: result.error };
        const match = result.outline.find(item => item.name === name);
        if (!match) return { success: false, error: `Symbol "${name}" not found in Python AST.` };
        return { success: true, path: args.path, symbol: name, start_line: match.start, end_line: match.end, code: lines.slice(match.start - 1, match.end).join('\n') };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    // 3. Brace Matching fallbacks for Go, Rust, Java, C++, C#
    const fallbackOutline = fallbackRegexOutline(code, ext);
    const match = fallbackOutline.find(item => item.name === name);
    if (match) {
      const startIdx = match.start - 1;
      const snippet = getBraceScopedBlock(lines, startIdx);
      const linesCount = snippet.split('\n').length;
      return {
        success: true,
        path: args.path,
        symbol: name,
        start_line: match.start,
        end_line: match.start + linesCount - 1,
        code: snippet,
        mode: 'brace_matching_fallback'
      };
    }

    // 4. Word-boundary fallback
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(name)) {
        // Return 25 lines as context
        const snippet = lines.slice(i, i + 25).join('\n');
        return {
          success: true,
          path: args.path,
          symbol: name,
          start_line: i + 1,
          end_line: i + 25,
          code: snippet,
          mode: 'context_window_fallback'
        };
      }
    }

    return { success: false, error: `Symbol "${name}" not found in file.` };
  },
};

export const astTools = [astGetNodeTool];
export default astTools;
