// den/src/agent/tools/semanticTools.js
// ─── Unified Semantic Search ─────────────────────────────────────────────────
// One tool that searches the agent's durable memory and the local RAG index
// together, so the model can recall prior knowledge and find relevant code/docs
// in a single call. Both sources go through the shared embedding service.

import { PermissionLevel } from './toolRegistry.js';
import { hybridRecall } from './memoryTools.js';
import { localRagSearchTool } from './localRagTools.js';
import { embeddingStatus } from '../../ai/embeddings/embeddingService.js';

export const semanticSearchTool = {
  name: 'semantic_search',
  description: 'Unified semantic search across the agent\'s durable memory and the local RAG index in one call. Returns the most relevant items from each source, ranked. Use to recall prior knowledge and locate relevant code/docs together.',
  category: 'rag',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural-language query.' },
      sources: {
        type: 'array',
        items: { type: 'string', enum: ['memory', 'rag'] },
        description: 'Which sources to search. Default both.',
      },
      limit: { type: 'number', description: 'Max results per source. Default 6, cap 15.' },
      index_name: { type: 'string', description: 'Optional local RAG index name. Defaults to the newest index.' },
    },
    required: ['query'],
  },
  execute: async (args, context) => {
    const query = String(args.query || '').trim();
    if (!query) return { success: false, error: 'query is required.' };
    const limit = Math.max(1, Math.min(15, Number(args.limit) || 6));
    const sources = Array.isArray(args.sources) && args.sources.length ? args.sources : ['memory', 'rag'];

    const out = {
      success: true,
      query,
      embedding: embeddingStatus(context.userId),
      memory: [],
      rag: [],
    };

    if (sources.includes('memory')) {
      try {
        const { memories, method } = await hybridRecall(context, { query, kind: 'all', limit });
        out.memoryMethod = method;
        out.memory = memories.map(m => ({
          key: m.key,
          kind: m.kind,
          content: m.content,
          importance: m.importance,
          score: m.score,
        }));
      } catch (e) { out.memoryError = e.message; }
    }

    if (sources.includes('rag')) {
      try {
        const res = await localRagSearchTool.execute({ query, limit, index_name: args.index_name }, context);
        if (res.success) {
          out.rag = res.results;
          out.ragMethod = res.method;
          out.ragIndex = res.indexName;
        } else {
          out.ragError = res.error;
        }
      } catch (e) { out.ragError = e.message; }
    }

    out.counts = { memory: out.memory.length, rag: out.rag.length };
    return out;
  },
};

export const semanticTools = [semanticSearchTool];
export default semanticTools;
