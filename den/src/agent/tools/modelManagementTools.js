// modelManagementTools.js — Agent tools for local model management + HuggingFace search/download

import { PermissionLevel } from './toolRegistry.js';
import {
  listModels,
  deleteModel,
  startDownload,
  cancelDownload,
  getDownloadStatus,
  listActiveDownloads,
} from '../../ai/controllers/ai/modelManager.js';
import {
  getHuggingFaceToken,
  huggingFaceHeaders,
  isHuggingFaceUrl,
} from '../../ai/controllers/ai/huggingFaceAuth.js';

// subDir mapping mirrors ModelDownloadHub.jsx TARGETS
const MODEL_TYPE_SUBDIRS = {
  model: '',
  llm: '',
  whisper: 'audio/whisper',
  stt: 'audio/whisper',
  tts: 'audio/tts',
  vision: 'vision',
  image: 'image',
};

function resolveSubDir(modelType) {
  return MODEL_TYPE_SUBDIRS[String(modelType || 'model').toLowerCase()] ?? '';
}

// ── list_local_models ─────────────────────────────────────────────────────────
export const listLocalModelsTool = {
  name: 'list_local_models',
  description:
    'List all model files currently downloaded to the local models directory. Returns filename, size (bytes), path, GGUF metadata (context length, quantization) when available, and any active download state.',
  category: 'ai',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      include_active_downloads: {
        type: 'boolean',
        description: 'Also include in-progress downloads. Default true.',
      },
    },
    required: [],
  },
  execute: async (args, _context = {}) => {
    const models = listModels();
    const result = { success: true, models, count: models.length };
    if (args?.include_active_downloads !== false) {
      result.activeDownloads = listActiveDownloads();
    }
    return result;
  },
};

// ── search_huggingface ────────────────────────────────────────────────────────
export const searchHuggingFaceTool = {
  name: 'search_huggingface',
  description:
    'Search HuggingFace Hub for models. Returns repo IDs, authors, download counts, likes, pipeline tags, and whether the model is gated (requires accepted license). Use this to help the user find a model before downloading it.',
  category: 'ai',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query, e.g. "mistral 7b instruct gguf"' },
      filter: {
        type: 'string',
        description: 'Pipeline tag filter, e.g. "gguf", "text-generation", "automatic-speech-recognition". Default "gguf".',
      },
      limit: { type: 'number', description: 'Max results to return (1–20). Default 10.' },
    },
    required: ['query'],
  },
  execute: async (args, context = {}) => {
    const query = String(args.query || '').trim();
    if (!query) return { success: false, error: 'query is required' };

    const filter = String(args.filter || 'gguf');
    const limit = Math.min(20, Math.max(1, Number(args.limit) || 10));

    const params = new URLSearchParams({ search: query, limit: String(limit) });
    if (filter) params.set('filter', filter);

    const headers = huggingFaceHeaders(context.userId);
    const url = `https://huggingface.co/api/models?${params.toString()}`;

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const hint = res.status === 401 || res.status === 403
          ? ' Check that your HF token is saved in Settings → Integrations → Hugging Face and that your account has accepted the model license.'
          : '';
        return { success: false, error: `HuggingFace API error ${res.status}: ${res.statusText}.${hint}` };
      }
      const raw = await res.json();
      const models = (Array.isArray(raw) ? raw : []).map(m => ({
        repoId: m.id || m.modelId,
        author: m.author,
        downloads: m.downloads,
        likes: m.likes,
        pipelineTag: m.pipeline_tag,
        tags: m.tags || [],
        gated: Boolean(m.gated),
        private: Boolean(m.private),
        lastModified: m.lastModified,
      }));
      const hasToken = Boolean(getHuggingFaceToken(context.userId));
      return { success: true, query, filter, models, count: models.length, hasHuggingFaceToken: hasToken };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── get_huggingface_model_files ───────────────────────────────────────────────
export const getHuggingFaceModelFilesTool = {
  name: 'get_huggingface_model_files',
  description:
    'List the files in a HuggingFace repo so you can identify the right file to download (e.g. the correct GGUF quantization). Returns filename and size for each file.',
  category: 'ai',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      repo_id: {
        type: 'string',
        description: 'The HuggingFace repo ID, e.g. "TheBloke/Mistral-7B-Instruct-v0.2-GGUF"',
      },
    },
    required: ['repo_id'],
  },
  execute: async (args, context = {}) => {
    const repoId = String(args.repo_id || '').trim();
    if (!repoId) return { success: false, error: 'repo_id is required' };

    const headers = huggingFaceHeaders(context.userId);
    const apiUrl = `https://huggingface.co/api/models/${repoId}`;

    try {
      const res = await fetch(apiUrl, { headers });
      if (!res.ok) {
        const hint = res.status === 401 || res.status === 403
          ? ' This model may be gated — ensure your HF token is saved in Settings → Integrations → Hugging Face and you have accepted the model license on huggingface.co.'
          : '';
        return { success: false, error: `HuggingFace API error ${res.status}: ${res.statusText}.${hint}` };
      }
      const data = await res.json();
      const files = (data.siblings || []).map(f => ({
        filename: f.rfilename,
        size: f.size ?? null,
      }));
      return {
        success: true,
        repoId,
        private: Boolean(data.private),
        gated: Boolean(data.gated),
        files,
        fileCount: files.length,
        downloadUrlBase: `https://huggingface.co/${repoId}/resolve/main/`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── download_model ────────────────────────────────────────────────────────────
export const downloadModelTool = {
  name: 'download_model',
  description:
    'Start downloading a model file from a URL (HuggingFace or direct link) into the local models directory. Returns a downloadId — use get_download_status to poll progress, or tell the user to check the Models page. Requires MODERATE permission because it writes files to disk.',
  category: 'ai',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Direct download URL of the model file. For HuggingFace use the resolve/main/ URL, e.g. "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf"',
      },
      filename: {
        type: 'string',
        description: 'Filename to save as. If omitted, derived from the URL.',
      },
      model_type: {
        type: 'string',
        enum: ['model', 'llm', 'whisper', 'stt', 'tts', 'vision', 'image'],
        description: 'Model type determines the storage subdirectory. Default "model" (root models dir).',
      },
    },
    required: ['url'],
  },
  execute: async (args, context = {}) => {
    const url = String(args.url || '').trim();
    if (!url) return { success: false, error: 'url is required' };

    let filename = String(args.filename || '').trim();
    if (!filename) {
      try {
        filename = decodeURIComponent(new URL(url).pathname.split('/').pop());
      } catch {
        return { success: false, error: 'Could not derive filename from URL. Please provide the filename parameter.' };
      }
    }
    if (!filename) return { success: false, error: 'filename is required (could not derive from URL)' };

    const subDir = resolveSubDir(args.model_type);
    const headers = isHuggingFaceUrl(url)
      ? huggingFaceHeaders(context.userId, { Accept: '*/*' })
      : undefined;

    try {
      const downloadId = await startDownload(url, filename, subDir, headers ? { headers } : {});
      return {
        success: true,
        downloadId,
        filename,
        subDir: subDir || '(root models dir)',
        message: `Download started. Use get_download_status with downloadId "${downloadId}" to check progress, or tell the user to open the Models page to watch progress in real time.`,
      };
    } catch (err) {
      const hint = err.message?.includes('HTTP 401') || err.message?.includes('HTTP 403')
        ? ' This model may be gated. Ensure your HF token is saved in Settings → Integrations → Hugging Face and you have accepted the license on huggingface.co.'
        : '';
      return { success: false, error: `${err.message}${hint}` };
    }
  },
};

// ── get_download_status ───────────────────────────────────────────────────────
export const getDownloadStatusTool = {
  name: 'get_download_status',
  description:
    'Check the progress of a model download by its downloadId. Returns progress percentage, bytes downloaded, total size, and status (downloading | completed | cancelled | error). Also lists all active downloads when no downloadId is given.',
  category: 'ai',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      download_id: {
        type: 'string',
        description: 'The downloadId returned by download_model. Omit to list all active downloads.',
      },
    },
    required: [],
  },
  execute: async (args, _context = {}) => {
    if (args?.download_id) {
      const status = getDownloadStatus(args.download_id);
      if (!status) return { success: false, error: `No download found with id "${args.download_id}"` };
      return { success: true, ...status };
    }
    return { success: true, activeDownloads: listActiveDownloads() };
  },
};

// ── cancel_model_download ─────────────────────────────────────────────────────
export const cancelModelDownloadTool = {
  name: 'cancel_model_download',
  description: 'Cancel an in-progress model download by its downloadId.',
  category: 'ai',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      download_id: { type: 'string', description: 'The downloadId returned by download_model.' },
    },
    required: ['download_id'],
  },
  execute: async (args, _context = {}) => {
    const id = String(args.download_id || '').trim();
    if (!id) return { success: false, error: 'download_id is required' };
    try {
      cancelDownload(id);
      return { success: true, downloadId: id, message: 'Download cancelled.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── delete_local_model ────────────────────────────────────────────────────────
export const deleteLocalModelTool = {
  name: 'delete_local_model',
  description:
    'Permanently delete a downloaded model file from the local models directory. This is irreversible — confirm with the user before calling. Only deletes files in the root models directory (use the filename as shown by list_local_models).',
  category: 'ai',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      filename: {
        type: 'string',
        description: 'The model filename to delete, exactly as returned by list_local_models.',
      },
    },
    required: ['filename'],
  },
  execute: async (args, _context = {}) => {
    const filename = String(args.filename || '').trim();
    if (!filename) return { success: false, error: 'filename is required' };
    try {
      deleteModel(filename);
      return { success: true, deleted: filename, message: `Model file "${filename}" deleted.` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const modelManagementTools = [
  listLocalModelsTool,
  searchHuggingFaceTool,
  getHuggingFaceModelFilesTool,
  downloadModelTool,
  getDownloadStatusTool,
  cancelModelDownloadTool,
  deleteLocalModelTool,
];

export default modelManagementTools;
