// modelFitEstimator.js — deterministic local-model memory and placement estimates.
//
// The estimator deliberately prefers the size of a concrete model file. For
// quantized GGUF models that is a better signal than parameter count alone.
// Parameter/quantization parsing remains as a fallback for repo/model names.

const GIB = 1024 ** 3;

export const QUANT_BYTES_PER_PARAM = Object.freeze({
  f32: 4, fp32: 4,
  f16: 2, fp16: 2, bf16: 2,
  q8_0: 1, q8: 1,
  q6_k: 0.75, q6k: 0.75,
  q5_k_m: 0.6875, q5_k_s: 0.625, q5_0: 0.625, q5_1: 0.625, q5k: 0.625,
  q4_k_m: 0.5625, q4_k_s: 0.5, q4_0: 0.5, q4_1: 0.5, q4k: 0.5, q4: 0.5,
  q3_k_l: 0.4375, q3_k_m: 0.375, q3_k_s: 0.375, q3k: 0.375,
  q2_k: 0.3125, q2k: 0.3125,
  iq4_xs: 0.5, iq4_nl: 0.5,
  iq3_m: 0.375, iq3_s: 0.375, iq3_xxs: 0.3125,
  iq2_m: 0.3125, iq2_s: 0.28125, iq2_xs: 0.25, iq2_xxs: 0.21875,
  iq1_m: 0.1875, iq1_s: 0.1875,
});

const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const finitePositive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function extractParamsBillions(nameOrPath) {
  const name = String(nameOrPath || '').toLowerCase().replace(/[_.-]+/g, ' ');
  const moe = name.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*b(?:illion)?\b/);
  if (moe) return Number(moe[1]) * Number(moe[2]);

  // For names such as "35B-A3B", the first number is the total parameter
  // count, which determines weight memory; the active count determines speed.
  const standard = name.match(/(\d+(?:\.\d+)?)\s*b(?:illion)?\b/);
  return standard ? Number(standard[1]) : null;
}

export function extractQuantization(nameOrPath) {
  const name = String(nameOrPath || '').toLowerCase().replace(/-/g, '_');
  return Object.keys(QUANT_BYTES_PER_PARAM)
    .sort((a, b) => b.length - a.length)
    .find(key => name.includes(key)) || null;
}

export function estimateModelMemory({
  modelName = '',
  sizeBytes,
  paramsBillions,
  quantization,
  contextLength = 4096,
} = {}) {
  const parsedParams = finitePositive(paramsBillions) || extractParamsBillions(modelName);
  const parsedQuant = String(quantization || extractQuantization(modelName) || 'q4_k_m')
    .toLowerCase()
    .replace(/-/g, '_');
  const concreteSize = finitePositive(sizeBytes);
  const ctx = Math.min(1048576, Math.max(512, Math.round(finitePositive(contextLength) || 4096)));

  let weightsGb = concreteSize ? concreteSize / GIB : null;
  let estimateSource = concreteSize ? 'file_size' : 'parameters';
  if (!weightsGb && parsedParams) {
    weightsGb = parsedParams * (QUANT_BYTES_PER_PARAM[parsedQuant] ?? QUANT_BYTES_PER_PARAM.q4_k_m);
  }

  if (!weightsGb) {
    return {
      known: false,
      contextLength: ctx,
      paramsBillions: parsedParams,
      quantization: parsedQuant,
      estimateSource: 'unknown',
      weightsGb: null,
      kvCacheGb: null,
      runtimeOverheadGb: null,
      totalGb: null,
    };
  }

  // Architecture-specific KV cache sizes vary (especially with GQA/MQA), so
  // use a conservative planning heuristic and clearly expose it as an estimate.
  const kvAt4k = parsedParams
    ? Math.max(0.2, parsedParams * 0.055)
    : Math.max(0.2, weightsGb * 0.07);
  const kvCacheGb = kvAt4k * (ctx / 4096);
  const runtimeOverheadGb = Math.max(0.35, weightsGb * 0.08);

  return {
    known: true,
    contextLength: ctx,
    paramsBillions: parsedParams ? round(parsedParams) : null,
    quantization: parsedQuant,
    estimateSource,
    weightsGb: round(weightsGb),
    kvCacheGb: round(kvCacheGb),
    runtimeOverheadGb: round(runtimeOverheadGb),
    totalGb: round(weightsGb + kvCacheGb + runtimeOverheadGb),
  };
}

function normalizeGpus(hardware) {
  const raw = Array.isArray(hardware?.gpu)
    ? hardware.gpu
    : hardware?.gpu
      ? [hardware.gpu]
      : Array.isArray(hardware?.gpus)
        ? hardware.gpus
        : [];

  return raw.map(gpu => ({
    ...gpu,
    totalGb: finitePositive(gpu?.vramTotalGb ?? gpu?.totalGb ?? gpu?.vramGb),
    freeGb: finitePositive(gpu?.vramFreeGb ?? gpu?.freeGb),
    unifiedMemory: Boolean(gpu?.unifiedMemory),
  }));
}

function result(status, placement, memory, capacity, description, extra = {}) {
  const labels = {
    great: 'Great fit',
    fits: 'Fits',
    partial: 'Partial GPU',
    cpu: 'CPU fit',
    tight: 'Tight fit',
    too_large: 'Too large',
    unknown: 'Unknown fit',
  };
  return {
    status,
    label: labels[status],
    placement,
    description,
    estimatedMemoryGb: memory.totalGb,
    capacityGb: capacity ? round(capacity) : null,
    memory,
    ...extra,
  };
}

export function estimateModelFit(model = {}, hardware = {}) {
  const memory = estimateModelMemory(model);
  const totalRamGb = finitePositive(hardware?.ram?.totalGb ?? hardware?.totalRamGb);
  const freeRamGb = finitePositive(hardware?.ram?.freeGb ?? hardware?.freeRamGb);
  const gpus = normalizeGpus(hardware);
  const unifiedGpu = gpus.find(gpu => gpu.unifiedMemory);
  const discreteGpu = gpus
    .filter(gpu => !gpu.unifiedMemory && gpu.totalGb)
    .sort((a, b) => b.totalGb - a.totalGb)[0];

  if (!memory.known) {
    return result(
      'unknown',
      'unknown',
      memory,
      null,
      'Not enough model size or parameter information is available to estimate fit.',
      { confidence: 'low' },
    );
  }

  if (!totalRamGb) {
    return result(
      'unknown',
      'unknown',
      memory,
      discreteGpu?.totalGb,
      'System memory could not be detected, so only the model memory estimate is available.',
      { confidence: memory.estimateSource === 'file_size' ? 'medium' : 'low' },
    );
  }

  const ramReserveGb = Math.max(2, totalRamGb * 0.15);
  const usableRamGb = Math.max(totalRamGb * 0.5, totalRamGb - ramReserveGb);
  const needsCloseApps = Boolean(freeRamGb && memory.totalGb > Math.max(0, freeRamGb - 1));
  const pressureNote = needsCloseApps ? ' Close other memory-heavy apps before loading it.' : '';
  const confidence = memory.estimateSource === 'file_size' ? 'high' : 'medium';

  if (unifiedGpu) {
    if (memory.totalGb <= usableRamGb * 0.72) {
      return result('great', 'unified', memory, usableRamGb,
        `Should run comfortably in shared CPU/GPU memory.${pressureNote}`, { confidence, needsCloseApps });
    }
    if (memory.totalGb <= usableRamGb) {
      return result('fits', 'unified', memory, usableRamGb,
        `Should fit in unified memory, with limited room for other apps.${pressureNote}`, { confidence, needsCloseApps });
    }
    if (memory.totalGb <= totalRamGb) {
      return result('tight', 'unified', memory, totalRamGb,
        'It may load in unified memory, but the operating system has almost no safety margin. Close other apps and use a shorter context.',
        { confidence, needsCloseApps: true });
    }
    return result('too_large', 'unified', memory, totalRamGb,
      `The estimate exceeds this machine's ${round(totalRamGb, 1)} GB unified-memory pool. Choose a smaller or more compressed file.`,
      { confidence, needsCloseApps: true });
  }

  if (discreteGpu) {
    const usableVramGb = discreteGpu.totalGb * 0.9;
    if (memory.totalGb <= usableVramGb * 0.85) {
      return result('great', 'gpu', memory, usableVramGb,
        `Should fit comfortably on ${discreteGpu.name || 'the GPU'}.`,
        { confidence, gpu: discreteGpu, needsCloseApps: false });
    }
    if (memory.totalGb <= usableVramGb) {
      return result('fits', 'gpu', memory, usableVramGb,
        `Should fit on ${discreteGpu.name || 'the GPU'}, but leaves little VRAM headroom.`,
        { confidence, gpu: discreteGpu, needsCloseApps: false });
    }
    const cpuSpillGb = Math.max(0, memory.totalGb - usableVramGb);
    const partialNeedsCloseApps = Boolean(freeRamGb && cpuSpillGb > Math.max(0, freeRamGb - 1));
    const partialPressureNote = partialNeedsCloseApps ? ' Close other memory-heavy apps before loading it.' : '';
    const combinedUsableGb = usableVramGb + usableRamGb;
    const combinedPhysicalGb = discreteGpu.totalGb + totalRamGb;
    if (memory.totalGb <= combinedUsableGb) {
      return result('partial', 'partial_gpu', memory, combinedUsableGb,
        `Too large for ${round(discreteGpu.totalGb, 1)} GB VRAM, but it should run by splitting layers across the GPU and system RAM. Expect lower speed.${partialPressureNote}`,
        { confidence, gpu: discreteGpu, needsCloseApps: partialNeedsCloseApps, combinedCapacityGb: round(combinedUsableGb) });
    }
    if (memory.totalGb <= combinedPhysicalGb) {
      return result('tight', 'partial_gpu', memory, combinedPhysicalGb,
        'It may run with limited GPU offload, but combined VRAM and system RAM will have almost no safety margin. Close other apps and reduce context.',
        { confidence, gpu: discreteGpu, needsCloseApps: true, combinedCapacityGb: round(combinedPhysicalGb) });
    }
    return result('too_large', 'partial_gpu', memory, combinedPhysicalGb,
      `The estimate exceeds the machine's combined ${round(discreteGpu.totalGb, 1)} GB VRAM and ${round(totalRamGb, 1)} GB system RAM capacity. Choose a smaller or more compressed file.`,
      { confidence, gpu: discreteGpu, needsCloseApps: true, combinedCapacityGb: round(combinedPhysicalGb) });
  }

  if (memory.totalGb <= usableRamGb * 0.75) {
    return result('cpu', 'cpu', memory, usableRamGb,
      `Should fit in system RAM. No GPU memory was detected, so inference will use the CPU and may be slower.${pressureNote}`,
      { confidence, needsCloseApps });
  }
  if (memory.totalGb <= usableRamGb) {
    return result('tight', 'cpu', memory, usableRamGb,
      `Should fit in system RAM, but with little headroom. CPU inference may be slow.${pressureNote}`,
      { confidence, needsCloseApps });
  }
  if (memory.totalGb <= totalRamGb) {
    return result('tight', 'cpu', memory, totalRamGb,
      'It may load on CPU, but system RAM will be nearly exhausted. Close other apps and reduce context.',
      { confidence, needsCloseApps: true });
  }
  return result('too_large', 'cpu', memory, totalRamGb,
    `The estimate exceeds this machine's ${round(totalRamGb, 1)} GB system RAM. Choose a smaller or more compressed file.`,
    { confidence, needsCloseApps: true });
}

export function estimateModelFits(models, hardware) {
  return (Array.isArray(models) ? models : []).map((model, index) => ({
    id: model?.id ?? String(index),
    ...estimateModelFit(model, hardware),
  }));
}
