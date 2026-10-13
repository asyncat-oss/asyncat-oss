// den/src/agent/tools/knowledgeTools.js
// ─── Project and agent knowledge ─────────────────────────────────────────────
// Searches the files the user added to the current project or agent. When the
// files are too large for the model's context window only excerpts are put in
// the prompt, and this tool finds the rest.

import { PermissionLevel } from './toolRegistry.js';
import { clampInt } from './shared.js';
import { searchKnowledge } from '../../knowledge/knowledgeStore.js';

export const knowledgeSearchTool = {
  name: 'knowledge_search',
  description: 'Search the knowledge files the user added to this project or agent (documents, notes, code, PDFs). Returns the most relevant passages with their file names. Use it when the answer may be in the project knowledge but is not already in the prompt.',
  category: 'search',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for, in plain words (names, terms, questions).' },
      max_results: { type: 'number', description: 'How many passages to return (default 8, at most 20).' },
    },
    required: ['query'],
  },
  execute: async (args, context = {}) => {
    const sources = Array.isArray(context.knowledgeSources) ? context.knowledgeSources : [];
    if (!sources.length) {
      return { success: false, error: 'This chat has no project or agent knowledge to search.' };
    }
    const hits = searchKnowledge(sources, String(args.query || ''), {
      maxTokens: 6000,
      maxChunks: clampInt(args.max_results, 8, 1, 20),
    });
    return {
      success: true,
      query: args.query,
      count: hits.length,
      results: hits.map((hit) => ({ file: hit.fileName, passage: hit.content })),
      ...(hits.length ? {} : { note: 'Nothing matched. Try other words, a file name, or a shorter query.' }),
    };
  },
};

export const knowledgeTools = [knowledgeSearchTool];
export default knowledgeTools;
