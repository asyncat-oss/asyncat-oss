// providerManager.js — Local AI provider detection, model listing, hardware stats
// Supports: Ollama, LM Studio, llama.cpp server, and any custom OpenAI-compatible endpoint

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

// Well-known local provider endpoints
const KNOWN_PROVIDERS = [
  {
    id: 'ollama',
    name: 'Ollama',
    defaultUrl: 'http://localhost:11434',
    apiBase: '/v1',
    modelsEndpoint: '/api/tags',
    psEndpoint: '/api/ps',
    description: 'Run Llama, Mistral, Gemma and more locally',
    icon: '🦙',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    defaultUrl: 'http://localhost:1234',
    apiBase: '/v1',
    modelsEndpoint: '/v1/models',
    psEndpoint: null,
    description: 'GUI app for running local models',
    icon: '🖥️',
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp server',
    defaultUrl: 'http://localhost:8080',
    apiBase: '/v1',
    modelsEndpoint: '/v1/models',
    psEndpoint: null,
    description: 'llama.cpp HTTP server',
    icon: '⚡',
  },
];

/**
 * Probe a single URL with a short timeout.
 * Returns { reachable, latencyMs } or { reachable: false }
 */
async function probeUrl(url, timeoutMs = 3000) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return { reachable: res.ok || res.status < 500, latencyMs: Date.now() - start };
  } catch {
    return { reachable: false, latencyMs: null };
  }
}

/**
 * Fetch available models from a provider.
 * Handles both Ollama's /api/tags format and OpenAI's /v1/models format.
 */
async function fetchModels(provider, baseUrl) {
  const url = baseUrl.replace(/\/$/, '') + provider.modelsEndpoint;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();

    // Ollama format: { models: [{ name, size, modified_at, details }] }
    if (data.models && Array.isArray(data.models)) {
      return data.models.map(m => ({
        id: m.name,
        name: m.name,
        size: m.size ? formatBytes(m.size) : null,
        family: m.details?.family || null,
        parameterSize: m.details?.parameter_size || null,
        quantization: m.details?.quantization_level || null,
        modifiedAt: m.modified_at || null,
      }));
    }

    // OpenAI format: { data: [{ id, object }] }
    if (data.data && Array.isArray(data.data)) {
      return data.data.map(m => ({
        id: m.id,
        name: m.id,
        size: null,
        family: null,
        parameterSize: null,
        quantization: null,
        modifiedAt: null,
      }));
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Fetch running models from Ollama's /api/ps endpoint.
 * Returns info about GPU/CPU usage for loaded models.
 */
async function fetchOllamaRunningModels(baseUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/ps`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}

/**
 * Get system hardware info (CPU, RAM, GPU).
 */
async function getSystemHardware() {
  const cpus = os.cpus();
  const totalRam = os.totalmem();
  const freeRam = os.freemem();

  const hardware = {
    cpu: {
      model: cpus[0]?.model?.trim() || 'Unknown CPU',
      cores: cpus.length,
      usagePercent: null, // sampled below
    },
    ram: {
      totalGb: +(totalRam / 1024 ** 3).toFixed(1),
      freeGb: +(freeRam / 1024 ** 3).toFixed(1),
      usedGb: +((totalRam - freeRam) / 1024 ** 3).toFixed(1),
      usagePercent: Math.round(((totalRam - freeRam) / totalRam) * 100),
    },
    gpu: null,
    platform: os.platform(),
    arch: os.arch(),
  };

  // Sample CPU usage (compare two snapshots 200ms apart)
  try {
    const sample1 = getCpuSample();
    await new Promise(r => setTimeout(r, 200));
    const sample2 = getCpuSample();
    const idle = sample2.idle - sample1.idle;
    const total = sample2.total - sample1.total;
    hardware.cpu.usagePercent = total > 0 ? Math.round((1 - idle / total) * 100) : 0;
  } catch {
    hardware.cpu.usagePercent = 0;
  }

  // Try NVIDIA GPU via nvidia-smi
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu --format=csv,noheader,nounits',
      { timeout: 3000 }
    );
    const lines = stdout.trim().split('\n').filter(Boolean);
    if (lines.length > 0) {
      hardware.gpu = lines.map(line => {
        const [name, memTotal, memUsed, memFree, utilGpu, temp] = line.split(',').map(s => s.trim());
        return {
          vendor: 'NVIDIA',
          name,
          vramTotalMb: parseInt(memTotal) || 0,
          vramUsedMb: parseInt(memUsed) || 0,
          vramFreeMb: parseInt(memFree) || 0,
          vramTotalGb: +((parseInt(memTotal) || 0) / 1024).toFixed(1),
          vramUsedGb: +((parseInt(memUsed) || 0) / 1024).toFixed(1),
          utilizationPercent: parseInt(utilGpu) || 0,
          temperatureC: parseInt(temp) || null,
        };
      });
      return hardware;
    }
  } catch { /* nvidia-smi not available */ }

  // Try AMD GPU via rocm-smi
  try {
    const { stdout } = await execAsync(
      'rocm-smi --showmeminfo vram --showuse --csv',
      { timeout: 3000 }
    );
    if (stdout.includes('GPU')) {
      hardware.gpu = [{ vendor: 'AMD', name: 'AMD GPU (ROCm)', raw: stdout.trim() }];
      return hardware;
    }
  } catch { /* rocm-smi not available */ }

  // Try Apple Metal / macOS system_profiler
  if (os.platform() === 'darwin') {
    try {
      const { stdout } = await execAsync(
        "system_profiler SPDisplaysDataType | grep -E 'Chipset Model|VRAM'",
        { timeout: 3000 }
      );
      if (stdout.trim()) {
        const lines = stdout.trim().split('\n').map(l => l.trim());
        const name = lines.find(l => l.startsWith('Chipset Model'))?.split(':')[1]?.trim() || 'Apple GPU';
        const vramLine = lines.find(l => l.includes('VRAM'));
        hardware.gpu = [{ vendor: 'Apple', name, vramInfo: vramLine || null }];
      }
    } catch { /* system_profiler not available */ }
  }

  return hardware;
}

function getCpuSample() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    for (const type of Object.values(cpu.times)) total += type;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

function formatBytes(bytes) {
  if (!bytes) return null;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

/**
 * Auto-detect all running local providers.
 * Returns array of { provider, reachable, latencyMs, models, runningModels }
 */
export async function detectProviders() {
  const results = await Promise.all(
    KNOWN_PROVIDERS.map(async (provider) => {
      const probe = await probeUrl(provider.defaultUrl, 2000);
      let models = [];
      let runningModels = [];

      if (probe.reachable) {
        models = await fetchModels(provider, provider.defaultUrl);
        if (provider.id === 'ollama') {
          runningModels = await fetchOllamaRunningModels(provider.defaultUrl);
        }
      }

      return {
        ...provider,
        reachable: probe.reachable,
        latencyMs: probe.latencyMs,
        models,
        runningModels,
        baseUrl: provider.defaultUrl,
      };
    })
  );

  return results;
}

/**
 * Test connectivity to a custom URL.
 * Returns { reachable, latencyMs, models }
 */
export async function testCustomProvider(baseUrl, providerId = 'custom') {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const probe = await probeUrl(cleanUrl, 4000);

  if (!probe.reachable) {
    return { reachable: false, latencyMs: null, models: [], error: 'Cannot reach the provided URL' };
  }

  // Try to list models
  let models = [];
  try {
    const res = await fetch(`${cleanUrl}/v1/models`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data.models) {
        models = data.models.map(m => ({ id: m.name || m.id, name: m.name || m.id }));
      } else if (data.data) {
        models = data.data.map(m => ({ id: m.id, name: m.id }));
      }
    }
  } catch { /* ignore */ }

  // Fallback: try Ollama /api/tags
  if (models.length === 0) {
    try {
      const res = await fetch(`${cleanUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (data.models) {
          models = data.models.map(m => ({ id: m.name, name: m.name }));
        }
      }
    } catch { /* ignore */ }
  }

  return { reachable: true, latencyMs: probe.latencyMs, models };
}

/**
 * Get hardware stats + Ollama running model info for a given provider config.
 */
export async function getProviderStats(providerConfig) {
  const [hardware, runningModels] = await Promise.all([
    getSystemHardware(),
    providerConfig?.providerId === 'ollama' && providerConfig?.baseUrl
      ? fetchOllamaRunningModels(providerConfig.baseUrl)
      : Promise.resolve([]),
  ]);

  // Find the currently selected model in running models
  const activeModel = runningModels.find(m => m.name === providerConfig?.model) || runningModels[0] || null;

  let modelHardwareInfo = null;
  if (activeModel) {
    modelHardwareInfo = {
      name: activeModel.name,
      sizeVram: activeModel.size_vram ? formatBytes(activeModel.size_vram) : null,
      sizeRam: activeModel.size ? formatBytes(activeModel.size) : null,
      gpuLayers: activeModel.details?.num_gpu || null,
      totalLayers: null, // not exposed by Ollama ps
      expiresAt: activeModel.expires_at || null,
    };
  }

  return {
    hardware,
    modelHardwareInfo,
    runningModels: runningModels.map(m => ({
      name: m.name,
      sizeVram: m.size_vram ? formatBytes(m.size_vram) : null,
      sizeRam: m.size ? formatBytes(m.size) : null,
    })),
  };
}

/**
 * Send a quick test message to verify the provider works end-to-end.
 */
export async function testProviderConnection(baseUrl, model) {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const start = Date.now();

  try {
    const res = await fetch(`${cleanUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
        max_tokens: 10,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const err = await res.text();
      return { success: false, latencyMs, error: `HTTP ${res.status}: ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || '(no response)';

    return { success: true, latencyMs, reply: reply.trim() };
  } catch (err) {
    return { success: false, latencyMs: Date.now() - start, error: err.message };
  }
}

export { KNOWN_PROVIDERS };
