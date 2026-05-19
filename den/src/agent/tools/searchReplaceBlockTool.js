// den/src/agent/tools/searchReplaceBlockTool.js
// ─── Aider-Style Search-and-Replace Block Edit Tool ──────────────────────
// Parses SEARCH/REPLACE blocks, verifies uniqueness, checks syntax validity,
// and applies edits.

import fs from 'fs';
import path from 'path';
import * as parser from '@babel/parser';
import { PermissionLevel } from './toolRegistry.js';
import { safePath } from './shared.js';

function parseEditBlocks(text) {
  const blocks = [];
  const regex = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      search: match[1],
      replace: match[2],
    });
  }
  return blocks;
}

// Check syntax using @babel/parser
function verifySyntax(filePath, newContent) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    return { valid: true };
  }
  try {
    parser.parse(newContent, {
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
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Syntax error introduced by edit: ${err.message}`,
      loc: err.loc,
    };
  }
}

export const searchReplaceBlockTool = {
  name: 'search_replace_block',
  description: 'Apply one or more Aider-style SEARCH/REPLACE edits to a file. Each block must match a unique part of the target file. The tool automatically validates JS/TS syntax correctness before writing.',
  category: 'file',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to working directory' },
      edit_blocks: {
        type: 'string',
        description: 'One or more blocks formatted as:\n<<<<<<< SEARCH\n[exact code to find]\n=======\n[replacement code]\n>>>>>>> REPLACE'
      },
    },
    required: ['path', 'edit_blocks'],
  },
  execute: async (args, context) => {
    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${args.path}` };
    }

    const blocks = parseEditBlocks(args.edit_blocks);
    if (blocks.length === 0) {
      return {
        success: false,
        error: 'No valid SEARCH/REPLACE blocks detected. Ensure correct format, including markers:\n<<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE'
      };
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const searchStr = block.search;
      const replaceStr = block.replace;

      // Uniqueness check
      const occurrences = content.split(searchStr).length - 1;
      if (occurrences === 0) {
        // Try fuzzy whitespace fallback
        const normalizeWS = s => s.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n').trim();
        const normalizedContent = normalizeWS(content);
        const normalizedSearch = normalizeWS(searchStr);

        if (normalizedSearch.length > 0 && normalizedContent.includes(normalizedSearch)) {
          const lines = content.split('\n');
          const searchLines = searchStr.split('\n').map(l => l.trim()).filter(Boolean);
          
          if (searchLines.length > 0) {
            let matchStart = -1;
            for (let idx = 0; idx < lines.length; idx++) {
              if (lines[idx].trim() === searchLines[0]) {
                let allMatch = true;
                for (let j = 1; j < searchLines.length && idx + j < lines.length; j++) {
                  if (lines[idx + j].trim() !== searchLines[j]) { allMatch = false; break; }
                }
                if (allMatch) { matchStart = idx; break; }
              }
            }
            if (matchStart >= 0) {
              const originalBlock = lines.slice(matchStart, matchStart + searchLines.length).join('\n');
              const fuzzyCount = content.split(originalBlock).length - 1;
              if (fuzzyCount === 1) {
                content = content.replace(originalBlock, replaceStr);
                continue;
              }
            }
          }
        }

        return {
          success: false,
          error: `Block ${i + 1} SEARCH block not found in "${args.path}". Verify that the find string matches exactly (case, space, and indentation).`
        };
      }

      if (occurrences > 1) {
        return {
          success: false,
          error: `Block ${i + 1} SEARCH block matched ${occurrences} times in "${args.path}". Add more surrounding context lines to make it unique.`
        };
      }

      content = content.replace(searchStr, replaceStr);
    }

    // Syntax validation
    const syntax = verifySyntax(filePath, content);
    if (!syntax.valid) {
      return {
        success: false,
        error: syntax.error,
        location: syntax.loc,
        suggestion: 'Ensure your replacement does not introduce unbalanced braces, missing imports, or invalid syntax.'
      };
    }

    fs.writeFileSync(filePath, content, 'utf8');

    return {
      success: true,
      path: args.path,
      blocks_applied: blocks.length,
      message: 'All SEARCH/REPLACE blocks successfully validated and applied.'
    };
  }
};

export const searchReplaceBlockTools = [searchReplaceBlockTool];
export default searchReplaceBlockTools;
