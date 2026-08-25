// hardwareTools.js — agent-facing wrappers around Asyncat's shared hardware
// detection and model-fit estimator. The Models UI and the agent therefore use
// the same memory assumptions and placement classifications.

import { PermissionLevel } from './toolRegistry.js';
import { getSystemHardware } from '../../ai/controllers/ai/providerManager.js';
import {
  estimateModelFit,
  estimateModelMemory,
  extractParamsBillions,
  extractQuantization,
} from '../../ai/controllers/ai/modelFitEstimator.js';

const normalizeGpus = (hardware) => {
  const raw = Array.isArray(hardware?.gpu) ? hardware.gpu : hardware?.gpu ? [hardware.gpu] : [];
  return raw.map(gpu => ({
    ...gpu,
    totalGb: gpu.vramTotalGb ?? gpu.totalGb ?? gpu.vramGb ?? null,
    freeGb: gpu.vramFreeGb ?? gpu.freeGb ?? null,
  }));
};

const fitRecommendation = (fit) => {
  const prefix = {
    great: 'Great fit',
    fits: 'Fits',
    partial: 'Partial GPU offload',
    cpu: 'CPU fit',
    tight: 'Tight fit',
    too_large: 'Too large',
    unknown: 'Unknown fit',
  }[fit.status] || 'Estimated fit';
  return `${prefix}: ${fit.description}`;
};

export const checkSystemMemoryTool = {
  name: 'check_system_memory',
  description:
    'Check available RAM and GPU VRAM on this machine. Works on Windows, Linux, and macOS including Apple Silicon unified memory. Use this before recommending a local model.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async () => {
    try {
      const hardware = await getSystemHardware({ sampleUsage: false });
      const gpus = normalizeGpus(hardware);
      return {
        success: true,
        platform: hardware.platform,
        arch: hardware.arch,
        cpu: hardware.cpu,
        ram: hardware.ram,
        gpus,
        gpuCount: gpus.length,
        hasGpu: gpus.length > 0,
        isAppleSilicon: gpus.some(gpu => gpu.unifiedMemory),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const estimateModelMemoryTool = {
  name: 'estimate_model_memory',
  description:
    'Estimate model RAM/VRAM needs and whether it is a full GPU fit, unified-memory fit, partial GPU offload, CPU fit, tight fit, or too large for this machine. Accepts GGUF, safetensors, MLX, and other model names.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      model_name: {
        type: 'string',
        description: 'Model filename or repo ID, for example "mistral-7b-instruct.Q4_K_M.gguf".',
      },
      size_bytes: {
        type: 'number',
        description: 'Concrete model file size in bytes. When known, this gives the most reliable weight-memory estimate.',
      },
      params_billions: {
        type: 'number',
        description: 'Total parameter count in billions (for example 7, 13, or 70). Auto-detected from model_name when possible.',
      },
      quantization: {
        type: 'string',
        description: 'Quantization such as Q4_K_M, Q8_0, F16, or BF16. Auto-detected from model_name when possible.',
      },
      context_length: {
        type: 'number',
        description: 'Context length to plan for. Default 4096; larger contexts increase KV-cache memory.',
      },
    },
    required: [],
  },
  execute: async (args) => {
    const modelName = String(args.model_name || '');
    const paramsBillions = args.params_billions != null
      ? Number(args.params_billions)
      : extractParamsBillions(modelName);
    const quantization = args.quantization || extractQuantization(modelName) || 'q4_k_m';
    const input = {
      modelName,
      sizeBytes: args.size_bytes,
      paramsBillions,
      quantization,
      contextLength: args.context_length || 4096,
    };
    const memory = estimateModelMemory(input);

    if (!memory.known) {
      return {
        success: false,
        error: 'Could not determine model size. Provide size_bytes or params_billions, or include a parameter count such as 7B or 70B in model_name.',
      };
    }

    try {
      const hardware = await getSystemHardware({ sampleUsage: false });
      const fit = estimateModelFit(input, hardware);
      const gpus = normalizeGpus(hardware);
      const unifiedGpu = gpus.find(gpu => gpu.unifiedMemory);

      return {
        success: true,
        model: modelName || `${paramsBillions}B ${quantization}`,
        paramsBillions: memory.paramsBillions,
        quantization: memory.quantization,
        contextLength: memory.contextLength,
        memoryEstimate: {
          modelGb: memory.weightsGb,
          kvCacheGb: memory.kvCacheGb,
          overheadGb: memory.runtimeOverheadGb,
          totalGb: memory.totalGb,
          source: memory.estimateSource,
        },
        system: {
          ramGb: hardware.ram.totalGb,
          freeRamGb: hardware.ram.freeGb,
          gpus,
          unifiedMemory: Boolean(unifiedGpu),
        },
        fit,
        fitsInRam: memory.totalGb <= hardware.ram.totalGb,
        fitsInVram: fit.placement === 'gpu' || fit.placement === 'unified',
        recommendations: [fitRecommendation(fit)],
        note: 'This is a planning estimate. Architecture, batch size, runtime, and other open applications can change actual usage.',
      };
    } catch (err) {
      return {
        success: true,
        model: modelName || `${paramsBillions}B ${quantization}`,
        paramsBillions: memory.paramsBillions,
        quantization: memory.quantization,
        contextLength: memory.contextLength,
        memoryEstimate: memory,
        system: null,
        fitsInRam: null,
        fitsInVram: null,
        recommendations: ['Model memory was estimated, but this machine hardware could not be detected.'],
        warning: err.message,
      };
    }
  },
};

export const hardwareTools = [checkSystemMemoryTool, estimateModelMemoryTool];
export default hardwareTools;
