// providerManager.js — Hardware stats for the built-in llama.cpp server

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

function getCpuSample() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    for (const type of Object.values(cpu.times)) total += type;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

export async function getSystemHardware({ sampleUsage = true } = {}) {
  const cpus = os.cpus();
  const totalRam = os.totalmem();
  const freeRam = os.freemem();

  const hardware = {
    cpu: {
      model: cpus[0]?.model?.trim() || 'Unknown CPU',
      cores: cpus.length,
      usagePercent: 0,
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

  // Sample CPU usage only for live stats. Fit checks do not need the delay.
  if (sampleUsage) {
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
          vramTotalGb: +((parseInt(memTotal) || 0) / 1024).toFixed(1),
          vramUsedGb: +((parseInt(memUsed) || 0) / 1024).toFixed(1),
          vramFreeGb: +((parseInt(memFree) || 0) / 1024).toFixed(1),
          utilizationPercent: parseInt(utilGpu) || 0,
          temperatureC: parseInt(temp) || null,
        };
      });
      return hardware;
    }
  } catch { /* nvidia-smi not available */ }

  // Try AMD GPU via ROCm, including VRAM capacity when the installed version
  // supports JSON output.
  try {
    const { stdout } = await execAsync('rocm-smi --showmeminfo vram --json', { timeout: 3000 });
    const data = JSON.parse(stdout);
    const detected = Object.entries(data || {}).map(([name, values]) => {
      const totalBytes = Number(values?.['VRAM Total Memory (B)'] ?? values?.vram_total ?? 0);
      const usedBytes = Number(values?.['VRAM Total Used Memory (B)'] ?? values?.vram_used ?? 0);
      return {
        vendor: 'AMD',
        name,
        vramTotalGb: totalBytes > 0 ? +(totalBytes / 1024 ** 3).toFixed(1) : null,
        vramUsedGb: usedBytes > 0 ? +(usedBytes / 1024 ** 3).toFixed(1) : 0,
        vramFreeGb: totalBytes > 0 ? +((totalBytes - usedBytes) / 1024 ** 3).toFixed(1) : null,
      };
    }).filter(gpu => gpu.vramTotalGb);
    if (detected.length > 0) {
      hardware.gpu = detected;
      return hardware;
    }
  } catch { /* rocm-smi not available */ }

  try {
    const { stdout } = await execAsync('rocm-smi --showuse --csv', { timeout: 3000 });
    if (stdout.includes('GPU')) {
      hardware.gpu = [{ vendor: 'AMD', name: 'AMD GPU (ROCm)', memoryUnknown: true }];
      return hardware;
    }
  } catch { /* rocm-smi not available */ }

  // Apple Silicon uses one pool for CPU and GPU memory. Always expose that
  // architecture even if system_profiler is unavailable.
  if (os.platform() === 'darwin' && os.arch() === 'arm64') {
    try {
      const { stdout } = await execAsync(
        'system_profiler SPHardwareDataType -json',
        { timeout: 3000 }
      );
      const profile = JSON.parse(stdout)?.SPHardwareDataType?.[0] || {};
      hardware.gpu = [{
        vendor: 'Apple',
        name: profile.chip_type || profile.cpu_type || 'Apple Silicon',
        vramTotalGb: hardware.ram.totalGb,
        vramUsedGb: hardware.ram.usedGb,
        vramFreeGb: hardware.ram.freeGb,
        unifiedMemory: true,
      }];
    } catch { /* system_profiler not available */ }
    if (!hardware.gpu) {
      hardware.gpu = [{
        vendor: 'Apple',
        name: 'Apple Silicon',
        vramTotalGb: hardware.ram.totalGb,
        vramUsedGb: hardware.ram.usedGb,
        vramFreeGb: hardware.ram.freeGb,
        unifiedMemory: true,
      }];
    }
  }

  return hardware;
}

export async function getProviderStats() {
  const hardware = await getSystemHardware();
  return { hardware, modelHardwareInfo: null, runningModels: [] };
}
