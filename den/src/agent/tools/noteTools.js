// den/src/agent/tools/noteTools.js
// ─── Note Tools ──────────────────────────────────────────────────────────────
// Create, read, and update notes as rich block-based documents.
// The note system stores blocks in metadata.blocks (version 2), which the
// ModernNoteEditor reads directly — enabling headings, callouts, tables,
// charts, code blocks, banners, and all other block types.

import { PermissionLevel } from './toolRegistry.js';
import { createNote, getNotes, getNoteById, updateNote } from '../../notes/service/noteService.js';

const generateId = () => `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Ensure every block has an id and required fields
function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.map(b => ({
    ...b,
    id: b.id || generateId(),
    content: b.content ?? '',
    properties: b.properties || {},
  }));
}

// Convert blocks to simple HTML fallback (for contexts that read .content, not metadata)
function blocksToHtml(blocks) {
  if (!blocks?.length) return '<p><br></p>';
  return blocks.map(b => {
    const c = b.content || '';
    switch (b.type) {
      case 'heading1':      return `<h1>${c}</h1>`;
      case 'heading2':      return `<h2>${c}</h2>`;
      case 'heading3':      return `<h3>${c}</h3>`;
      case 'bulletList':    return `<ul><li>${c}</li></ul>`;
      case 'numberedList':  return `<ol><li>${c}</li></ol>`;
      case 'todo':          return `<p>[${b.properties?.checked ? 'x' : ' '}] ${c}</p>`;
      case 'quote':         return `<blockquote><p>${c}</p></blockquote>`;
      case 'code':          return `<pre><code class="language-${b.properties?.language || 'text'}">${c}</code></pre>`;
      case 'callout':       return `<div class="callout callout-${b.properties?.type || 'info'}"><p>${c}</p></div>`;
      case 'divider':       return `<hr/>`;
      case 'toggle':        return `<details><summary>${b.properties?.title || c}</summary></details>`;
      case 'math':          return `<p>\\(${c}\\)</p>`;
      case 'table': {
        const rows = b.properties?.tableData || [[]];
        const hasHeader = b.properties?.hasHeader;
        const trs = rows.map((row, ri) => `<tr>${row.map(cell => hasHeader && ri === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`).join('')}</tr>`).join('');
        return `<table>${trs}</table>`;
      }
      default: return c ? `<p>${c}</p>` : '<p><br></p>';
    }
  }).join('');
}

// Apply inline markdown to any string (bold, italic, code, links)
function inlineMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// Parse markdown/text into a native blocks array (fallback when no blocks param provided)
function textToBlocks(text) {
  if (!text) return [{ id: generateId(), type: 'text', content: '', properties: {} }];
  const blocks = [];
  const paragraphs = text.split(/\n{2,}/);
  for (const para of paragraphs) {
    for (const line of para.split('\n')) {
      if (!line.trim()) continue;
      if (/^### /.test(line))        blocks.push({ id: generateId(), type: 'heading3',     content: inlineMd(line.slice(4).trim()), properties: {} });
      else if (/^## /.test(line))    blocks.push({ id: generateId(), type: 'heading2',     content: inlineMd(line.slice(3).trim()), properties: {} });
      else if (/^# /.test(line))     blocks.push({ id: generateId(), type: 'heading1',     content: inlineMd(line.slice(2).trim()), properties: {} });
      else if (/^[-*] /.test(line))  blocks.push({ id: generateId(), type: 'bulletList',   content: inlineMd(line.slice(2)), properties: {} });
      else if (/^\d+\. /.test(line)) blocks.push({ id: generateId(), type: 'numberedList', content: inlineMd(line.replace(/^\d+\. /, '')), properties: {} });
      else if (/^---+$/.test(line.trim())) blocks.push({ id: generateId(), type: 'divider', content: '', properties: { style: 'line' } });
      else blocks.push({ id: generateId(), type: 'text', content: inlineMd(line), properties: {} });
    }
  }
  return blocks.length ? blocks : [{ id: generateId(), type: 'text', content: '', properties: {} }];
}

function noteArtifact(note) {
  return {
    type: 'note',
    noteId: note.id,
    title: note.title,
    content: note.content || '',
    createdAt: note.createdat || note.createdAt,
    updatedAt: note.updatedat || note.updatedAt,
  };
}

// ── Shared block schema reference (injected into tool descriptions) ───────────
const BLOCK_SCHEMA_DESC = `
Each block: { "type": string, "content": string, "properties": {} }
Content supports inline HTML: <strong>bold</strong>, <em>italic</em>, <code>code</code>.

Block types:
  text, heading1, heading2, heading3, bulletList, numberedList, quote
  todo          → properties: { checked: false }
  divider       → properties: { style: "line"|"dashed"|"dotted"|"double" }
  code          → properties: { language: "javascript"|"python"|"bash"|"sql"|"typescript"|... }
  callout       → properties: { type: "info"|"warning"|"error"|"success"|"tip"|"note", title: "..." }
  toggle        → properties: { title: "Section label", isOpen: false }
  table         → properties: { tableData: [["H1","H2"],["val","val"]], hasHeader: true }
  math          → content is LaTeX, e.g. "E = mc^2"
  barChart/lineChart/areaChart → properties: { data: { labels: ["A","B","C"], datasets: [{ label: "S1", data: [10,20,30] }] } }
  pieChart/donutChart          → properties: { data: { labels: ["A","B"], datasets: [{ label: "S", data: [60,40] }] } }

Banner (top of note): { type: "gradient", gradient: "linear-gradient(45deg, #667eea, #764ba2)" }
  or: { type: "color", color: "#4f46e5" }
  Presets: Ocean "linear-gradient(45deg,#667eea,#764ba2)" · Sunset "linear-gradient(45deg,#FF6B6B,#FFE66D)" · Forest "linear-gradient(45deg,#11998e,#38ef7d)" · Cosmic "linear-gradient(45deg,#2E3192,#1BFFFF)"
`.trim();

// ── create_note ──────────────────────────────────────────────────────────────

export const createNoteTool = {
  name: 'create_note',
  description: `Create a rich note saved to the user's Notes library. Always use the "blocks" array for rich formatting — it supports headings, callouts, code, tables, charts, banners, and more. The note opens as a full block editor in the chat side panel.

${BLOCK_SCHEMA_DESC}

Example:
{ "title": "Plan", "banner": { "type": "gradient", "gradient": "linear-gradient(45deg, #667eea, #764ba2)" }, "blocks": [
  { "type": "heading1", "content": "Project Plan" },
  { "type": "callout", "content": "Q3 roadmap tracker.", "properties": { "type": "info", "title": "Overview" } },
  { "type": "heading2", "content": "Goals" },
  { "type": "bulletList", "content": "<strong>Launch</strong> new onboarding flow" },
  { "type": "divider", "content": "", "properties": { "style": "line" } },
  { "type": "table", "content": "", "properties": { "hasHeader": true, "tableData": [["Phase","Owner","Due"],["Design","Alice","Jun 15"],["Dev","Bob","Jul 1"]] } }
]}`,
  category: 'notes',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title' },
      content: { type: 'string', description: 'Fallback plain text or markdown — used only when "blocks" is not provided' },
      blocks: {
        type: 'array',
        description: 'Rich block array. Each block: { "type": string, "content": string, "properties": {} }. See tool description for full schema.',
        items: { type: 'object' },
      },
      banner: {
        type: 'object',
        description: 'Optional banner at the top of the note. { "type": "gradient"|"color", "gradient": "css-string" | "color": "#hex" }',
      },
    },
    required: ['title'],
  },
  execute: async (args, context) => {
    try {
      const rawBlocks = args.blocks?.length
        ? normalizeBlocks(args.blocks)
        : textToBlocks(args.content || '');

      const htmlContent = blocksToHtml(rawBlocks);

      const metadata = {
        source: 'agent',
        sessionId: context.session?.id || null,
        version: 2,
        blocks: rawBlocks,
      };

      if (args.banner) {
        metadata.banner = {
          ...args.banner,
          setAt: new Date().toISOString(),
        };
      }

      const note = await createNote({
        title: args.title || 'Untitled Note',
        content: htmlContent,
        metadata,
        conversation_id: context.conversationId || null,
        agent_session_id: context.session?.id || null,
      }, context.userId);

      return {
        success: true,
        artifact: noteArtifact(note),
        message: `Note "${note.title}" created (id: ${note.id})`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── update_note ──────────────────────────────────────────────────────────────

export const updateNoteTool = {
  name: 'update_note',
  description: 'Update the title and/or content of an existing note. Use "blocks" array to set rich content (same schema as create_note). Pass "banner" to add/change the banner, or null to remove it.',
  category: 'notes',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      note_id: { type: 'string', description: 'The ID of the note to update' },
      title: { type: 'string', description: 'New title (optional)' },
      content: { type: 'string', description: 'Fallback markdown content — used only when "blocks" is not provided' },
      blocks: {
        type: 'array',
        description: 'New block array. Replaces all existing blocks.',
        items: { type: 'object' },
      },
      banner: {
        type: 'object',
        description: 'Update the banner. { "type": "gradient"|"color", "gradient": "css" | "color": "#hex" }. Pass null to remove.',
      },
    },
    required: ['note_id'],
  },
  execute: async (args, context) => {
    try {
      const existing = await getNoteById(args.note_id, context.userId);
      const existingMeta = (typeof existing.metadata === 'string'
        ? JSON.parse(existing.metadata)
        : existing.metadata) || {};

      const rawBlocks = args.blocks?.length
        ? normalizeBlocks(args.blocks)
        : args.content
          ? textToBlocks(args.content)
          : null;

      const updates = {};

      if (args.title) updates.title = args.title;

      if (rawBlocks) {
        updates.content = blocksToHtml(rawBlocks);
        updates.metadata = {
          ...existingMeta,
          version: 2,
          blocks: rawBlocks,
        };
      }

      if ('banner' in args) {
        const meta = updates.metadata || { ...existingMeta };
        if (args.banner === null) {
          delete meta.banner;
        } else {
          meta.banner = { ...args.banner, setAt: new Date().toISOString() };
        }
        updates.metadata = meta;
      }

      const note = await updateNote(args.note_id, updates, context.userId);
      return {
        success: true,
        artifact: noteArtifact(note),
        message: `Note "${note.title}" updated`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── append_to_note ───────────────────────────────────────────────────────────

export const appendToNoteTool = {
  name: 'append_to_note',
  description: 'Append content to the end of an existing note. Use "blocks" array for rich formatting (same schema as create_note), or "content" for plain text/markdown.',
  category: 'notes',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      note_id: { type: 'string', description: 'The ID of the note to append to' },
      content: { type: 'string', description: 'Text/markdown to append — used only when "blocks" is not provided' },
      blocks: {
        type: 'array',
        description: 'Blocks to append to the end of the note.',
        items: { type: 'object' },
      },
    },
    required: ['note_id'],
  },
  execute: async (args, context) => {
    try {
      const existing = await getNoteById(args.note_id, context.userId);
      const existingMeta = (typeof existing.metadata === 'string'
        ? JSON.parse(existing.metadata)
        : existing.metadata) || {};

      const existingBlocks = existingMeta.version === 2 && Array.isArray(existingMeta.blocks)
        ? existingMeta.blocks
        : textToBlocks(existing.content || '');

      const newBlocks = args.blocks?.length
        ? normalizeBlocks(args.blocks)
        : textToBlocks(args.content || '');

      const merged = [...existingBlocks, ...newBlocks];
      const updatedMeta = { ...existingMeta, version: 2, blocks: merged };

      const note = await updateNote(args.note_id, {
        content: blocksToHtml(merged),
        metadata: updatedMeta,
      }, context.userId);

      return {
        success: true,
        artifact: noteArtifact(note),
        message: `Appended to note "${note.title}"`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── list_notes ───────────────────────────────────────────────────────────────

export const listNotesTool = {
  name: 'list_notes',
  description: 'List the user\'s recent notes (title and ID). Use this to find a note ID before calling update_note or append_to_note.',
  category: 'notes',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum number of notes to return (default: 20)' },
    },
    required: [],
  },
  execute: async (_args, context) => {
    try {
      const notes = await getNotes(context.userId, true);
      const limit = Math.min(_args?.limit || 20, 50);
      const results = notes.slice(0, limit).map(n => ({
        id: n.id,
        title: n.title,
        updatedAt: n.updatedat || n.updatedAt,
      }));
      return { success: true, count: results.length, notes: results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const noteTools = [
  createNoteTool,
  updateNoteTool,
  appendToNoteTool,
  listNotesTool,
];
export default noteTools;
