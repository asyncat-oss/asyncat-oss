// hardwareTools.js — Cross-platform RAM/VRAM detection + model memory estimation
// Works on Windows, Linux, macOS (including Apple Silicon unified memory).

import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PermissionLevel } from './toolRegistry.js';

const execFileAsync = promisify(execFile);

// ── Quantization bytes-per-parameter lookup ───────────────────────────────────
// These are approximate but close enough for hardware fit estimation.
const QUANT_BYTES = {
  f32: 4.0, fp32: 4.0,
  f16: 2.0, fp16: 2.0,
  bf16: 2.0,
  q8_0: 1.0, q8: 1.0,
  q6_k: 0.75, q6k: 0.75,
  q5_k_m: 0.6875, q5_k_s: 0.625, q5_0: 0.625, q5_1: 0.625, q5k: 0.625,
  q4_k_m: 0.5625, q4_k_s: 0.5, q4_0: 0.5, q4_1: 0.5, q4k: 0.5, q4: 0.5,
  q3_k_m: 0.375, q3_k_s: 0.375, q3_k_l: 0.4375, q3k: 0.375,
  q2_k: 0.3125, q2k: 0.3125,
  iq4_xs: 0.5, iq4_nl: 0.5,
  iq3_m: 0.375, iq3_s: 0.375, iq3_xxs: 0.3125,
  iq2_m: 0.3125, iq2_s: 0.28125, iq2_xs: 0.25, iq2_xxs: 0.21875,
  iq1_m: 0.1875, iq1_s: 0.1875,
};

// ── Parameter count extraction from model filename ────────────────────────────
const PARAM_PATTERNS = [
  // "671B", "72b", "7.3b", "0.5b", "1.5b"
  /(\d+(?:\.\d+)?)\s*[bB](?:illion)?(?:\b|_|-)/,
  // "8x7b" MoE (8 experts × 7B active → ~47B total params)
  /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*[bB]/,
];

function extractParamsBillions(nameOrPath) {
  const name = String(nameOrPath || '').toLowerCase().replace(/[_\-\.]/g, ' ');

  // MoE pattern "8x7b"
  const moeMatch = name.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*b(?:illion)?/);
  if (moeMatch) {
    const experts = parseFloat(moeMatch[1]);
    const paramsPerExpert = parseFloat(moeMatch[2]);
    return experts * paramsPerExpert;
  }

  // Standard "Xb" pattern
  const match = name.match(/(\d+(?:\.\d+)?)\s*b(?:illion)?(?:\s|$|-|_)/);
  if (match) return parseFloat(match[1]);

  return null;
}

function extractQuantization(nameOrPath) {
  const name = String(nameOrPath || '').toLowerCase();
  // Try known quant strings, longest match first
  const keys = Object.keys(QUANT_BYTES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (name.includes(k)) return k;
  }
  return null;
}

// ── GPU detection (cross-platform) ───────────────────────────────────────────

async function detectNvidiaGpu() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,memory.total,memory.free',
      '--format=csv,noheader,nounits',
    ], { timeout: 5000 });

    const gpus = stdout.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split(',').map(s => s.trim());
      return {
        vendor: 'NVIDIA',
        name: parts[0] || 'Unknown',
        totalMb: parseInt(parts[1]) || 0,
        freeMb: parseInt(parts[2]) || 0,
        totalGb: parseFloat(((parseInt(parts[1]) || 0) / 1024).toFixed(2)),
        freeGb: parseFloat(((parseInt(parts[2]) || 0) / 1024).toFixed(2)),
      };
    });
    return gpus.length ? gpus : null;
  } catch {
    return null;
  }
}

async function detectAmdGpu() {
  try {
    const { stdout } = await execFileAsync('rocm-smi', ['--showmeminfo', 'vram', '--json'], { timeout: 5000 });
    const data = JSON.parse(stdout);
    const gpus = Object.entries(data).map(([key, vals]) => {
      const total = parseInt(vals['VRAM Total Memory (B)'] || vals['vram_total'] || 0);
      const used = parseInt(vals['VRAM Total Used Memory (B)'] || vals['vram_used'] || 0);
      return {
        vendor: 'AMD',
        name: key,
        totalGb: parseFloat((total / 1073741824).toFixed(2)),
        freeGb: parseFloat(((total - used) / 1073741824).toFixed(2)),
      };
    });
    return gpus.length ? gpus : null;
  } catch {
    return null;
  }
}

async function detectAppleGpu() {
  if (process.platform !== 'darwin') return null;
  try {
    const { stdout } = await execFileAsync('system_profiler', ['SPHardwareDataType', '-json'], { timeout: 6000 });
    const data = JSON.parse(stdout);
    const hw = data?.SPHardwareDataType?.[0] || {};
    const chip = hw.chip_type || hw.cpu_type || '';
    const isAppleSilicon = /apple m\d|apple silicon/i.test(chip);

    if (!isAppleSilicon) return null;

    // Apple Silicon: unified memory — GPU uses system RAM
    const totalBytes = parseInt(hw.physical_memory) || os.totalmem();
    const totalGb = parseFloat((totalBytes / 1073741824).toFixed(2)) || parseFloat((os.totalmem() / 1073741824).toFixed(2));
    const freeGb = parseFloat((os.freemem() / 1073741824).toFixed(2));

    return [{
      vendor: 'Apple',
      name: chip || 'Apple Silicon',
      totalGb,
      freeGb,
      unifiedMemory: true,
      note: 'Unified memory — GPU and CPU share the same pool',
    }];
  } catch {
    // Fallback: just check if we're on Apple Silicon via arch
    try {
      const { stdout } = await execFileAsync('uname', ['-m'], { timeout: 2000 });
      if (stdout.trim() === 'arm64') {
        const totalGb = parseFloat((os.totalmem() / 1073741824).toFixed(2));
        return [{
          vendor: 'Apple',
          name: 'Apple Silicon',
          totalGb,
          freeGb: parseFloat((os.freemem() / 1073741824).toFixed(2)),
          unifiedMemory: true,
          note: 'Unified memory — GPU and CPU share the same pool',
        }];
      }
    } catch { /* ignore */ }
    return null;
  }
}

async function getSystemMemoryInfo() {
  const totalRamGb = parseFloat((os.totalmem() / 1073741824).toFixed(2));
  const freeRamGb = parseFloat((os.freemem() / 1073741824).toFixed(2));
  const platform = process.platform; // 'win32' | 'darwin' | 'linux'

  // Try GPU detection in priority order
  const [nvidia, amd, apple] = await Promise.allSettled([
    detectNvidiaGpu(),
    detectAmdGpu(),
    detectAppleGpu(),
  ]);

  const gpus = (nvidia.value || amd.value || apple.value) || [];

  return { totalRamGb, freeRamGb, gpus, platform };
}

// ── Model memory estimator ────────────────────────────────────────────────────

function estimateMemory(paramsBillions, quantKey, contextLength = 4096) {
  const bytesPerParam = QUANT_BYTES[quantKey?.toLowerCase()] ?? 0.5;
  const modelGb = paramsBillions * bytesPerParam;

  // KV cache rough estimate: 2 (K+V) * context * (params_b / 8) * 2 bytes / 1e9
  // This is a rough heuristic; actual depends on architecture
  const kvCacheGb = (2 * contextLength * (paramsBillions / 8) * 2) / 1e9;
  const overheadGb = modelGb * 0.1; // ~10% runtime overhead

  const totalGb = modelGb + kvCacheGb + overheadGb;
  return {
    modelGb: parseFloat(modelGb.toFixed(2)),
    kvCacheGb: parseFloat(kvCacheGb.toFixed(2)),
    overheadGb: parseFloat(overheadGb.toFixed(2)),
    totalGb: parseFloat(totalGb.toFixed(2)),
  };
}

function recommend(totalNeededGb, totalRamGb, gpus, paramsBillions, isAppleSilicon) {
  const tips = [];

  if (isAppleSilicon) {
    if (totalNeededGb <= totalRamGb * 0.75) {
      tips.push('✅ Model fits comfortably in unified memory.');
    } else if (totalNeededGb <= totalRamGb) {
      tips.push('⚠️ Model fits but will use most of your RAM — close other apps.');
    } else {
      tips.push(`❌ Model needs ~${totalNeededGb.toFixed(1)} GB but you only have ${totalRamGb} GB unified memory.`);
      tips.push('Try a smaller model or a lower quantization (e.g. Q4_K_M instead of Q8_0).');
    }
    return tips;
  }

  // Discrete GPU path
  if (gpus.length) {
    const primaryGpu = gpus[0];
    if (totalNeededGb <= primaryGpu.totalGb * 0.9) {
      tips.push(`✅ Fits in GPU VRAM (${primaryGpu.totalGb} GB ${primaryGpu.name}).`);
    } else if (totalNeededGb <= totalRamGb) {
      tips.push(`⚠️ Too large for GPU VRAM (${primaryGpu.totalGb} GB) — will run on CPU RAM. Expect slower inference.`);
    } else {
      tips.push(`❌ Needs ~${totalNeededGb.toFixed(1)} GB, exceeds both VRAM (${primaryGpu.totalGb} GB) and RAM (${totalRamGb} GB).`);
      tips.push('Try a smaller model or lower quantization.');
    }
  } else {
    // CPU-only
    if (totalNeededGb <= totalRamGb * 0.75) {
      tips.push(`✅ Fits in RAM (${totalRamGb} GB). No GPU detected — CPU inference only.`);
    } else if (totalNeededGb <= totalRamGb) {
      tips.push(`⚠️ Fits in RAM but tight. Close other apps. CPU inference will be slow.`);
    } else {
      tips.push(`❌ Needs ~${totalNeededGb.toFixed(1)} GB but only ${totalRamGb} GB RAM available.`);
      tips.push('Try a smaller model or lower quantization.');
    }
  }

  // Quantization suggestions
  if (paramsBillions && totalNeededGb > totalRamGb) {
    const q4Gb = estimateMemory(paramsBillions, 'q4_k_m').totalGb;
    const q2Gb = estimateMemory(paramsBillions, 'q2_k').totalGb;
    if (q4Gb <= totalRamGb) tips.push(`💡 Q4_K_M quantization would need ~${q4Gb.toFixed(1)} GB and would fit.`);
    else if (q2Gb <= totalRamGb) tips.push(`💡 Q2_K would need ~${q2Gb.toFixed(1)} GB — very compressed but would fit.`);
  }

  return tips;
}

// ── Tool: check_system_memory ─────────────────────────────────────────────────
export const checkSystemMemoryTool = {
  name: 'check_system_memory',
  description:
    'Check available RAM and GPU VRAM on this machine. Works on Windows, Linux, and macOS including Apple Silicon (unified memory). Use this before recommending a model to run locally.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async () => {
    try {
      const info = await getSystemMemoryInfo();
      return {
        success: true,
        platform: info.platform,
        ram: {
          totalGb: info.totalRamGb,
          freeGb: info.freeRamGb,
        },
        gpus: info.gpus,
        gpuCount: info.gpus.length,
        hasGpu: info.gpus.length > 0,
        isAppleSilicon: info.gpus.some(g => g.unifiedMemory),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── Tool: estimate_model_memory ───────────────────────────────────────────────
export const estimateModelMemoryTool = {
  name: 'estimate_model_memory',
  description:
    'Estimate how much RAM/VRAM a model will need based on its parameter count and quantization. Also checks if it fits on this machine. Works for any model — GGUF, safetensors, MLX, etc. Pass the model filename or repo ID and optionally override params/quant.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      model_name: {
        type: 'string',
        description: 'Model filename or repo ID, e.g. "mistral-7b-instruct-v0.2.Q4_K_M.gguf" or "meta-llama/Llama-3.1-8B". Used to auto-detect params and quantization.',
      },
      params_billions: {
        type: 'number',
        description: 'Parameter count in billions (e.g. 7, 13, 70). Auto-detected from model_name if not given.',
      },
      quantization: {
        type: 'string',
        description: 'Quantization level, e.g. "Q4_K_M", "Q8_0", "F16", "BF16". Auto-detected from model_name if not given.',
      },
      context_length: {
        type: 'number',
        description: 'Context window length in tokens (affects KV cache). Default 4096.',
      },
    },
    required: [],
  },
  execute: async (args) => {
    const modelName = String(args.model_name || '');

    let paramsBillions = args.params_billions != null
      ? parseFloat(args.params_billions)
      : extractParamsBillions(modelName);

    let quantKey = args.quantization
      ? args.quantization.toLowerCase().replace(/-/g, '_')
      : extractQuantization(modelName);

    if (!paramsBillions) {
      return {
        success: false,
        error: 'Could not determine parameter count. Provide params_billions explicitly or include it in model_name (e.g. "7b", "70B").',
      };
    }

    if (!quantKey) {
      quantKey = 'q4_k_m'; // safe default assumption
    }

    const contextLength = Math.max(512, parseInt(args.context_length) || 4096);
    const memory = estimateMemory(paramsBillions, quantKey, contextLength);

    // Get system info
    let systemInfo = null;
    let recommendations = [];
    try {
      systemInfo = await getSystemMemoryInfo();
      const isAppleSilicon = systemInfo.gpus.some(g => g.unifiedMemory);
      recommendations = recommend(memory.totalGb, systemInfo.totalRamGb, systemInfo.gpus, paramsBillions, isAppleSilicon);
    } catch { /* non-fatal — still return estimates */ }

    return {
      success: true,
      model: modelName || `${paramsBillions}B ${quantKey}`,
      paramsBillions,
      quantization: quantKey,
      contextLength,
      memoryEstimate: memory,
      system: systemInfo ? {
        ramGb: systemInfo.totalRamGb,
        freeRamGb: systemInfo.freeRamGb,
        gpus: systemInfo.gpus,
      } : null,
      fitsInRam: systemInfo ? memory.totalGb <= systemInfo.totalRamGb : null,
      fitsInVram: systemInfo?.gpus?.length
        ? memory.totalGb <= systemInfo.gpus[0].totalGb
        : null,
      recommendations,
      note: 'Estimates are approximate. Actual usage depends on architecture, batch size, and runtime overhead.',
    };
  },
};

export const hardwareTools = [checkSystemMemoryTool, estimateModelMemoryTool];
export default hardwareTools;
