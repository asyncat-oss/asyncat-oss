// modelStatusTools.js — agent-facing visibility into loaded AI runtimes

import { PermissionLevel } from './toolRegistry.js';
import { getModelRuntimeStatus } from '../../ai/controllers/ai/modelRuntimeStatus.js';

function compactStatus(status) {
  const loadedModels = Array.isArray(status.loadedModels) ? status.loadedModels : [];
  return {
    success: true,
    generatedAt: status.generatedAt,
    activeProvider: status.activeProvider,
    counts: status.counts,
    loadedModels,
    llm: {
      activeProvider: status.llm?.activeProvider || status.activeProvider || null,
      loaded: status.llm?.loaded || [],
      llama: {
        status: status.llm?.llama?.status || 'unknown',
        model: status.llm?.llama?.model || null,
        modelInfo: status.llm?.llama?.modelInfo || null,
        pid: status.llm?.llama?.pid || null,
        port: status.llm?.llama?.port || null,
        ctxSize: status.llm?.llama?.ctxSize || null,
        ctxTrain: status.llm?.llama?.ctxTrain || null,
        hardware: status.llm?.llama?.hardware || null,
        configured: status.llm?.llama?.configured || {},
        memory: status.llm?.llama?.memory || null,
      },
      mlx: {
        status: status.llm?.mlx?.status || 'unknown',
        model: status.llm?.mlx?.model || null,
        modelInfo: status.llm?.mlx?.modelInfo || null,
        pid: status.llm?.mlx?.pid || null,
        port: status.llm?.mlx?.port || null,
        mlxAvailable: Boolean(status.llm?.mlx?.mlxAvailable),
        memory: status.llm?.mlx?.memory || null,
      },
    },
    stt: status.stt,
    tts: status.tts,
    image: {
      preferredRuntime: status.image?.preferredRuntime || null,
      loaded: status.image?.loaded || [],
      simple: {
        found: Boolean(status.image?.simple?.found),
        status: status.image?.simple?.status || 'unknown',
        modelCount: status.image?.simple?.modelCount || 0,
        binaryPath: status.image?.simple?.binaryPath || null,
        error: status.image?.simple?.error || null,
      },
      comfyui: {
        found: Boolean(status.image?.comfyui?.found),
        status: status.image?.comfyui?.status || 'unknown',
        baseUrl: status.image?.comfyui?.baseUrl || null,
        checkpointCount: status.image?.comfyui?.checkpointCount || 0,
        checkpoints: status.image?.comfyui?.checkpoints || [],
        devices: status.image?.comfyui?.devices || [],
        error: status.image?.comfyui?.error || null,
      },
      catalog: status.image?.catalog || {},
    },
  };
}

export const aiStatusTool = {
  name: 'ai_status',
  description:
    'Inspect the active AI/model runtime dashboard: active chat provider, loaded LLM runtimes, Whisper STT, Piper TTS, image generation runtimes, model sizes, quantization when detectable, process memory, and VRAM details when exposed by the runtime. Use this before claiming what models are loaded.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      detailed: { type: 'boolean', description: 'Return the full runtime snapshot. Default false returns a compact status.' },
    },
    required: [],
  },
  execute: async (args, context = {}) => {
    const status = await getModelRuntimeStatus(context.userId || null);
    return args?.detailed ? status : compactStatus(status);
  },
};

export const modelsLoadedTool = {
  name: 'models_loaded',
  description:
    'List only the models/runtimes currently loaded in memory. This is a compact alias for ai_status when the user asks what is running right now.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (_args, context = {}) => {
    const status = await getModelRuntimeStatus(context.userId || null);
    return {
      success: true,
      generatedAt: status.generatedAt,
      activeProvider: status.activeProvider,
      counts: status.counts,
      loadedModels: status.loadedModels || [],
    };
  },
};

export const modelStatusTools = [aiStatusTool, modelsLoadedTool];
export default modelStatusTools;
