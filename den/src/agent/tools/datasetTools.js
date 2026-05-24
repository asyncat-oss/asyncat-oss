// datasetTools.js — HuggingFace Dataset search, preview, and JSONL export tools
// Works cross-platform, no Python required — pure HTTP to HF APIs.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { PermissionLevel } from './toolRegistry.js';
import { getHuggingFaceToken, huggingFaceHeaders } from '../../ai/controllers/ai/huggingFaceAuth.js';

const HF_HUB_API = 'https://huggingface.co/api';
const HF_DATASETS_SERVER = 'https://datasets-server.huggingface.co';

function getDatasetsDir() {
  const base = process.env.ASYNCAT_HOME || path.join(os.homedir(), '.asyncat');
  const dir = path.join(base, 'datasets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Extract a plain-text snippet from a note's block-editor JSON content or raw string
function extractTextSnippet(content, maxLen = 120) {
  if (!content) return '';
  try {
    const parsed = JSON.parse(content);
    const walk = (node) => {
      if (!node) return '';
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) return node.map(walk).join(' ');
      if (node.text) return node.text;
      if (node.content) return walk(node.content);
      return '';
    };
    return walk(parsed).replace(/\s+/g, ' ').trim().slice(0, maxLen);
  } catch {
    return String(content).replace(/\s+/g, ' ').trim().slice(0, maxLen);
  }
}

// ── search_hf_datasets ────────────────────────────────────────────────────────
export const searchHfDatasetsTool = {
  name: 'search_hf_datasets',
  description:
    'Search HuggingFace Hub for datasets. Returns repo IDs, task categories, download counts, sizes, and whether the dataset requires an accepted license. Use this before downloading a dataset.',
  category: 'ai',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search terms, e.g. "instruction following alpaca"' },
      task: { type: 'string', description: 'Filter by task category, e.g. "text-generation", "question-answering". Optional.' },
      limit: { type: 'number', description: 'Max results (1–20). Default 10.' },
    },
    required: ['query'],
  },
  execute: async (args, context = {}) => {
    const query = String(args.query || '').trim();
    if (!query) return { success: false, error: 'query is required' };

    const limit = Math.min(20, Math.max(1, Number(args.limit) || 10));
    const params = new URLSearchParams({ search: query, limit: String(limit) });
    if (args.task) params.set('filter', args.task);

    try {
      const res = await fetch(`${HF_HUB_API}/datasets?${params}`, {
        headers: huggingFaceHeaders(context.userId),
      });
      if (!res.ok) {
        return { success: false, error: `HuggingFace API ${res.status}: ${res.statusText}` };
      }
      const raw = await res.json();
      const datasets = (Array.isArray(raw) ? raw : []).map(d => ({
        repoId: d.id,
        author: d.author,
        downloads: d.downloads,
        likes: d.likes,
        tags: (d.tags || []).slice(0, 8),
        gated: Boolean(d.gated),
        private: Boolean(d.private),
        lastModified: d.lastModified,
      }));
      return {
        success: true,
        query,
        datasets,
        count: datasets.length,
        hasHuggingFaceToken: Boolean(getHuggingFaceToken(context.userId)),
        tip: 'Run hf_dataset_info with a repoId to see splits and features before downloading.',
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── hf_dataset_info ───────────────────────────────────────────────────────────
export const hfDatasetInfoTool = {
  name: 'hf_dataset_info',
  description:
    'Get metadata for a HuggingFace dataset: available splits (train/test/validation), column names and types, number of rows, and dataset size. Use this to understand a dataset before downloading.',
  category: 'ai',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      repo_id: { type: 'string', description: 'Dataset repo ID, e.g. "tatsu-lab/alpaca" or "openai/summarize_from_feedback"' },
      config: { type: 'string', description: 'Dataset config/subset name. Leave blank to use default.' },
    },
    required: ['repo_id'],
  },
  execute: async (args, context = {}) => {
    const repoId = String(args.repo_id || '').trim();
    if (!repoId) return { success: false, error: 'repo_id is required' };

    const headers = huggingFaceHeaders(context.userId);

    try {
      // Get splits
      const splitParams = new URLSearchParams({ dataset: repoId });
      if (args.config) splitParams.set('config', args.config);

      const [splitsRes, cardRes] = await Promise.allSettled([
        fetch(`${HF_DATASETS_SERVER}/splits?${splitParams}`, { headers }),
        fetch(`${HF_HUB_API}/datasets/${repoId}`, { headers }),
      ]);

      const splitsData = splitsRes.status === 'fulfilled' && splitsRes.value.ok
        ? await splitsRes.value.json()
        : null;
      const cardData = cardRes.status === 'fulfilled' && cardRes.value.ok
        ? await cardRes.value.json()
        : null;

      if (!splitsData && !cardData) {
        return {
          success: false,
          error: `Could not fetch info for "${repoId}". It may be private, gated, or not yet processed by the HF dataset server.`,
          hint: Boolean(getHuggingFaceToken(context.userId))
            ? 'Try accepting the dataset license on huggingface.co.'
            : 'Set your HF token in Settings → Integrations → Hugging Face for private/gated datasets.',
        };
      }

      const splits = (splitsData?.splits || []).map(s => ({
        config: s.config,
        split: s.split,
      }));

      // Get features (column info) from first split
      let features = null;
      let rowCounts = {};
      if (splitsData?.splits?.length) {
        const firstSplit = splitsData.splits[0];
        try {
          const infoParams = new URLSearchParams({
            dataset: repoId,
            config: firstSplit.config,
          });
          const infoRes = await fetch(`${HF_DATASETS_SERVER}/info?${infoParams}`, { headers });
          if (infoRes.ok) {
            const info = await infoRes.json();
            const cfg = info?.dataset_info?.[firstSplit.config] || info?.dataset_info;
            if (cfg) {
              features = cfg.features;
              if (cfg.splits) {
                Object.entries(cfg.splits).forEach(([name, s]) => {
                  rowCounts[name] = s.num_examples;
                });
              }
            }
          }
        } catch { /* non-fatal */ }
      }

      return {
        success: true,
        repoId,
        gated: Boolean(cardData?.gated),
        private: Boolean(cardData?.private),
        downloads: cardData?.downloads,
        likes: cardData?.likes,
        tags: cardData?.tags?.slice(0, 10),
        splits,
        features: features ? Object.entries(features).map(([name, f]) => ({
          name,
          dtype: f.dtype || f._type || (f.feature ? 'sequence' : 'unknown'),
        })) : null,
        rowCounts,
        tip: splits.length
          ? `Use preview_hf_dataset to see sample rows, then download_dataset_jsonl to export.`
          : 'No splits found — dataset may not be processed yet.',
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── preview_hf_dataset ────────────────────────────────────────────────────────
export const previewHfDatasetTool = {
  name: 'preview_hf_dataset',
  description:
    'Preview the first few rows of a HuggingFace dataset split. Use this to inspect column names and values before deciding on a field mapping for JSONL export.',
  category: 'ai',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      repo_id: { type: 'string', description: 'Dataset repo ID, e.g. "tatsu-lab/alpaca"' },
      split: { type: 'string', description: 'Split name: "train", "test", "validation". Default "train".' },
      config: { type: 'string', description: 'Dataset config/subset. Leave blank for default.' },
      rows: { type: 'number', description: 'Number of rows to preview (1–10). Default 3.' },
    },
    required: ['repo_id'],
  },
  execute: async (args, context = {}) => {
    const repoId = String(args.repo_id || '').trim();
    if (!repoId) return { success: false, error: 'repo_id is required' };

    const split = String(args.split || 'train');
    const rows = Math.min(10, Math.max(1, Number(args.rows) || 3));
    const headers = huggingFaceHeaders(context.userId);

    try {
      // First get the config name if not provided
      let config = String(args.config || '');
      if (!config) {
        const splitsRes = await fetch(
          `${HF_DATASETS_SERVER}/splits?dataset=${encodeURIComponent(repoId)}`,
          { headers }
        );
        if (splitsRes.ok) {
          const splitsData = await splitsRes.json();
          config = splitsData?.splits?.[0]?.config || 'default';
        }
      }

      const params = new URLSearchParams({
        dataset: repoId,
        config,
        split,
        offset: '0',
        length: String(rows),
      });

      const res = await fetch(`${HF_DATASETS_SERVER}/rows?${params}`, { headers });
      if (!res.ok) {
        const hint = res.status === 404
          ? ' Dataset may not be processed by HF yet. Try hf_dataset_info to check available splits.'
          : res.status === 401 || res.status === 403
            ? ' This dataset may be gated. Set your HF token in Settings → Integrations.'
            : '';
        return { success: false, error: `Datasets server ${res.status}${hint}` };
      }

      const data = await res.json();
      const sampleRows = (data.rows || []).map(r => r.row);
      const columns = sampleRows.length ? Object.keys(sampleRows[0]) : [];

      return {
        success: true,
        repoId,
        split,
        config,
        columns,
        rows: sampleRows,
        tip: `To export as JSONL for fine-tuning, use download_dataset_jsonl with field_mapping. Column names: ${columns.join(', ')}`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── download_dataset_jsonl ────────────────────────────────────────────────────
export const downloadDatasetJsonlTool = {
  name: 'download_dataset_jsonl',
  description:
    'Download a HuggingFace dataset split and save it as a JSONL file ready for fine-tuning. Supports raw export (one JSON object per line) or conversion to Alpaca, ChatML, or ShareGPT instruction-tuning formats. Large datasets are streamed in batches.',
  category: 'ai',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      repo_id: { type: 'string', description: 'Dataset repo ID, e.g. "tatsu-lab/alpaca"' },
      split: { type: 'string', description: 'Split: "train", "test", "validation". Default "train".' },
      config: { type: 'string', description: 'Dataset config/subset. Leave blank for default.' },
      max_rows: { type: 'number', description: 'Maximum rows to download (default 5000, max 100000). Large values take time.' },
      format: {
        type: 'string',
        enum: ['raw', 'alpaca', 'chatml', 'sharegpt'],
        description: 'Output format. "raw" = original JSON rows. "alpaca" = {instruction,input,output}. "chatml"/"sharegpt" = conversation format. Default "raw".',
      },
      field_mapping: {
        type: 'object',
        description: 'Map dataset column names to format fields. E.g. for alpaca: {"instruction":"instruction","input":"input","output":"output"}. For chatml: {"conversations":"conversations"} or {"human":"question","assistant":"answer"}.',
      },
      output_filename: { type: 'string', description: 'Output filename. Default derived from repo_id + split + format.' },
    },
    required: ['repo_id'],
  },
  execute: async (args, context = {}) => {
    const repoId = String(args.repo_id || '').trim();
    if (!repoId) return { success: false, error: 'repo_id is required' };

    const split = String(args.split || 'train');
    const format = String(args.format || 'raw');
    const maxRows = Math.min(100000, Math.max(1, Number(args.max_rows) || 5000));
    const fieldMapping = args.field_mapping || {};
    const headers = huggingFaceHeaders(context.userId);

    // Resolve config
    let config = String(args.config || '');
    if (!config) {
      try {
        const splitsRes = await fetch(
          `${HF_DATASETS_SERVER}/splits?dataset=${encodeURIComponent(repoId)}`,
          { headers }
        );
        if (splitsRes.ok) {
          const sd = await splitsRes.json();
          config = sd?.splits?.find(s => s.split === split)?.config
            || sd?.splits?.[0]?.config
            || 'default';
        }
      } catch { config = 'default'; }
    }

    // Output path
    const slug = repoId.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = args.output_filename
      ? String(args.output_filename)
      : `${slug}-${split}-${format}.jsonl`;
    const outputPath = path.join(getDatasetsDir(), filename);

    const BATCH = 500;
    let offset = 0;
    let written = 0;
    let skipped = 0;
    const writeStream = fs.createWriteStream(outputPath);

    const convertRow = (row) => {
      if (format === 'raw') return row;

      if (format === 'alpaca') {
        const instrField = fieldMapping.instruction || 'instruction';
        const inputField = fieldMapping.input || 'input';
        const outputField = fieldMapping.output || 'output';
        const instruction = row[instrField] || row.prompt || row.question || '';
        const input = row[inputField] || '';
        const output = row[outputField] || row.response || row.answer || row.completion || '';
        if (!instruction && !output) return null;
        return { instruction, input, output };
      }

      if (format === 'chatml' || format === 'sharegpt') {
        // If dataset has a conversations field
        const convoField = fieldMapping.conversations || 'conversations';
        if (row[convoField] && Array.isArray(row[convoField])) {
          const convos = row[convoField].map(turn => ({
            role: turn.from === 'human' ? 'user' : turn.from === 'gpt' ? 'assistant' : (turn.role || turn.from),
            content: turn.value || turn.content || '',
          }));
          return { conversations: convos };
        }
        // Otherwise build from human/assistant field pairs
        const humanField = fieldMapping.human || fieldMapping.user || 'prompt';
        const assistantField = fieldMapping.assistant || fieldMapping.output || 'response';
        const human = row[humanField] || row.instruction || row.question || '';
        const assistant = row[assistantField] || row.output || row.answer || '';
        if (!human && !assistant) return null;
        return {
          conversations: [
            { role: 'user', content: human },
            { role: 'assistant', content: assistant },
          ],
        };
      }

      return row;
    };

    try {
      while (written < maxRows) {
        const batchSize = Math.min(BATCH, maxRows - written);
        const params = new URLSearchParams({
          dataset: repoId,
          config,
          split,
          offset: String(offset),
          length: String(batchSize),
        });

        const res = await fetch(`${HF_DATASETS_SERVER}/rows?${params}`, { headers });
        if (!res.ok) {
          writeStream.end();
          return {
            success: false,
            error: `Datasets server ${res.status} at offset ${offset}. ${written} rows written before error.`,
            partialOutput: outputPath,
            rowsWritten: written,
          };
        }

        const data = await res.json();
        const rows = (data.rows || []).map(r => r.row);
        if (rows.length === 0) break; // no more rows

        for (const row of rows) {
          const converted = convertRow(row);
          if (converted !== null) {
            writeStream.write(JSON.stringify(converted) + '\n');
            written++;
          } else {
            skipped++;
          }
        }

        offset += rows.length;
        if (rows.length < batchSize) break; // reached end of split
      }

      await new Promise((resolve, reject) => {
        writeStream.end();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const stats = fs.statSync(outputPath);
      return {
        success: true,
        repoId,
        split,
        config,
        format,
        rowsWritten: written,
        rowsSkipped: skipped,
        outputPath,
        fileSizeMb: (stats.size / 1024 / 1024).toFixed(2),
        message: `Saved ${written} rows to ${outputPath}. Point your fine-tuning script at this file.`,
      };
    } catch (err) {
      writeStream.end();
      return { success: false, error: err.message };
    }
  },
};

// ── list_local_datasets ───────────────────────────────────────────────────────
export const listLocalDatasetsTool = {
  name: 'list_local_datasets',
  description: 'List all dataset JSONL files downloaded to the local datasets directory.',
  category: 'ai',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async () => {
    const dir = getDatasetsDir();
    try {
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'))
        .map(f => {
          const full = path.join(dir, f);
          const stat = fs.statSync(full);
          return {
            filename: f,
            path: full,
            sizeMb: (stat.size / 1024 / 1024).toFixed(2),
            modifiedAt: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
      return { success: true, datasetsDir: dir, files, count: files.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const datasetTools = [
  searchHfDatasetsTool,
  hfDatasetInfoTool,
  previewHfDatasetTool,
  downloadDatasetJsonlTool,
  listLocalDatasetsTool,
];

export default datasetTools;
