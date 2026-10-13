/**
 * Put a project's (and an agent's) instructions and knowledge into a chat.
 *
 * Like Claude Projects: when everything fits comfortably in the model's
 * context window it all goes in; when it doesn't, only the passages most
 * related to the request go in and the agent can search the rest with the
 * knowledge_search tool. Images go to models that can see them, and are
 * named for models that can't.
 */

import {
  estimateTokens, knowledgeImageNames, knowledgeImages, knowledgeStats, knowledgeTexts, searchKnowledge,
} from './knowledgeStore.js';

// Share of the context window that instructions and knowledge may use. The
// rest is for the system prompt, tool definitions, the conversation and the
// answer.
export const KNOWLEDGE_SHARE = 0.45;
const MAX_IMAGES = 4;
const MAX_INSTRUCTION_TOKENS = 8000;

export function knowledgeBudget(contextWindow) {
  const window = Number(contextWindow) > 0 ? Number(contextWindow) : 8192;
  return Math.floor(window * KNOWLEDGE_SHARE);
}

function clipToTokens(text, maxTokens) {
  const clean = String(text || '').trim();
  if (estimateTokens(clean) <= maxTokens) return clean;
  const chars = Math.max(0, maxTokens * 3);
  return `${clean.slice(0, chars)}\n… (cut to fit the model's context window)`;
}

function fileBlock(name, content) {
  return `<knowledge_file name="${String(name).replace(/"/g, "'")}">\n${content}\n</knowledge_file>`;
}

/**
 * sources: [{ type: 'project'|'agent', id, label, instructions }]
 * Returns { prompt, images, stats }.
 */
export function buildKnowledgeContext({ sources = [], query = '', contextWindow, supportsImages = false }) {
  const usable = sources.filter((s) => s?.type && s?.id);
  const budget = knowledgeBudget(contextWindow);
  const sections = [];
  let used = 0;

  for (const source of usable) {
    const text = clipToTokens(source.instructions, Math.min(MAX_INSTRUCTION_TOKENS, Math.floor(budget / 2)));
    if (!text) continue;
    sections.push(`## Instructions for this ${source.label}\nFollow these in every reply unless the user says otherwise:\n\n${text}`);
    used += estimateTokens(text);
  }

  const files = usable.flatMap((source) => knowledgeTexts(source.type, source.id).map((file) => ({ ...file, source })));
  const totalTokens = files.reduce((sum, file) => sum + (file.tokens || 0), 0);
  let mode = files.length ? 'full' : 'none';
  let includedTokens = 0;

  if (files.length && used + totalTokens <= budget) {
    sections.push([
      '## Knowledge files',
      'Reference material the user added. Use it when it is relevant; quote it accurately and say which file you used.',
      ...files.map((file) => fileBlock(file.name, file.text)),
    ].join('\n\n'));
    includedTokens = totalTokens;
  } else if (files.length) {
    mode = 'search';
    const remaining = Math.max(0, budget - used);
    const hits = searchKnowledge(usable.map((s) => ({ type: s.type, id: s.id })), query, { maxTokens: Math.floor(remaining * 0.85) });
    includedTokens = hits.reduce((sum, hit) => sum + hit.tokens, 0);
    sections.push([
      '## Knowledge files (excerpts)',
      `The user added ${files.length} knowledge file${files.length === 1 ? '' : 's'} (about ${Math.round(totalTokens / 1000)}k tokens), more than fits in this model's context window, so only the parts most related to the request are below. Use the knowledge_search tool to look up anything else in them (files: ${files.map((f) => f.name).join(', ')}).`,
      ...(hits.length
        ? hits.map((hit) => fileBlock(hit.fileName, hit.content))
        : ['(No passage matched the request directly; search the files when you need them.)']),
    ].join('\n\n'));
  }

  const imageNames = usable.flatMap((source) => knowledgeImageNames(source.type, source.id));
  let images = [];
  if (imageNames.length) {
    if (supportsImages) {
      images = usable.flatMap((source) => knowledgeImages(source.type, source.id, { limit: MAX_IMAGES })).slice(0, MAX_IMAGES);
      sections.push(`## Knowledge images\nThe first message includes ${images.length} image${images.length === 1 ? '' : 's'} from the knowledge: ${images.map((i) => i.name).join(', ')}.${imageNames.length > images.length ? ` (${imageNames.length - images.length} more not shown.)` : ''}`);
    } else {
      sections.push(`## Knowledge images\nThe knowledge also has image files (${imageNames.join(', ')}), but the current model can't see images, so they are not included.`);
    }
  }

  return {
    prompt: sections.join('\n\n'),
    images: images.map((image) => image.dataUrl),
    stats: {
      budget,
      instructionsTokens: used,
      knowledgeTokens: totalTokens,
      includedTokens,
      mode,
      fileCount: files.length,
      imageCount: imageNames.length,
      imagesIncluded: images.length,
    },
  };
}

/**
 * How a project's or agent's knowledge sits against a model: shown as the
 * context meter on the project and agent pages.
 */
export function knowledgeFitReport({ ownerType, ownerId, instructions = '', profile }) {
  const stats = knowledgeStats(ownerType, ownerId);
  const contextWindow = profile?.contextWindow || null;
  const budget = contextWindow ? knowledgeBudget(contextWindow) : null;
  const instructionsTokens = estimateTokens(String(instructions || '').trim());
  const imageTokens = profile?.supportsImages ? Math.min(stats.imageCount, MAX_IMAGES) * 1000 : 0;
  const needed = instructionsTokens + stats.textTokens + imageTokens;
  return {
    model: profile?.ready ? {
      name: profile.model,
      provider: profile.providerName,
      contextWindow,
      contextSourceLabel: profile.contextSourceLabel,
      supportsImages: profile.supportsImages,
      isLocal: profile.isLocal,
    } : null,
    modelUnavailableReason: profile?.ready ? null : (profile?.reason || null),
    instructionsTokens,
    knowledgeTokens: stats.textTokens,
    fileCount: stats.fileCount,
    imageCount: stats.imageCount,
    budget,
    neededTokens: needed,
    fits: budget === null ? null : needed <= budget,
    percentOfWindow: contextWindow ? Math.round((needed / contextWindow) * 1000) / 10 : null,
  };
}
