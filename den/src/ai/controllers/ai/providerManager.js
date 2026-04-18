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

async function getSystemHardware() {
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
    const { stdout } = await execAsync('rocm-smi --showmeminfo vram --showuse --csv', { timeout: 3000 });
    if (stdout.includes('GPU')) {
      hardware.gpu = [{ vendor: 'AMD', name: 'AMD GPU (ROCm)', raw: stdout.trim() }];
      return hardware;
    }
  } catch { /* rocm-smi not available */ }

  // Try Apple Metal via system_profiler
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

export async function getProviderStats() {
  const hardware = await getSystemHardware();
  return { hardware, modelHardwareInfo: null, runningModels: [] };
}
