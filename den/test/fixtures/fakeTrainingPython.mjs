// Stands in for the training environment's Python in tests and demo runs:
// it passes the import check, fakes a train_lora.py run (progress lines and
// a tiny Llama adapter in final-adapter/), and hands any other script, such
// as lora_to_gguf.py, to the real Python.
//
// Use it through a small shell wrapper at <ASYNCAT_HOME>/training/python/bin/python:
//   #!/bin/sh
//   exec node /path/to/fakeTrainingPython.mjs "$@"

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [script, ...args] = process.argv.slice(2);
const emit = (payload) => process.stdout.write(`${JSON.stringify(payload)}\n`);

function bf16(values) {
  const out = Buffer.alloc(values.length * 2);
  const f = new Float32Array(1);
  const u = new Uint32Array(f.buffer);
  values.forEach((value, i) => { f[0] = value; out.writeUInt16LE(u[0] >>> 16, i * 2); });
  return out;
}

function writeSafetensors(file, tensors) {
  const header = {};
  const parts = [];
  let offset = 0;
  for (const [name, { shape, data }] of Object.entries(tensors)) {
    header[name] = { dtype: 'BF16', shape, data_offsets: [offset, offset + data.length] };
    parts.push(data);
    offset += data.length;
  }
  const json = Buffer.from(JSON.stringify(header));
  const size = Buffer.alloc(8);
  size.writeBigUInt64LE(BigInt(json.length));
  fs.writeFileSync(file, Buffer.concat([size, json, ...parts]));
}

function option(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

async function fakeTraining() {
  const outputDir = option('--output-dir');
  const dataset = option('--dataset');
  const rows = fs.readFileSync(dataset, 'utf8').split('\n').filter(Boolean).length;
  emit({ type: 'preflight', datasetRows: rows, model: option('--model'), backend: option('--backend') });
  emit({ type: 'status', message: 'Loading model (fake)…' });
  const total = 4;
  for (let step = 1; step <= total; step++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    emit({ type: 'progress', step, totalSteps: total, percent: (step / total) * 100, loss: 2 - step * 0.3, epoch: step / 2 });
  }
  const finalDir = path.join(outputDir, 'final-adapter');
  fs.mkdirSync(finalDir, { recursive: true });
  fs.writeFileSync(path.join(finalDir, 'adapter_config.json'), JSON.stringify({ r: 2, lora_alpha: 4, peft_type: 'LORA', base_model_name_or_path: option('--model') }));
  fs.writeFileSync(path.join(finalDir, 'base_config.json'), JSON.stringify({ architectures: ['LlamaForCausalLM'], num_attention_heads: 2, num_key_value_heads: 1, hidden_size: 8 }));
  const prefix = 'base_model.model.model.layers.0';
  writeSafetensors(path.join(finalDir, 'adapter_model.safetensors'), {
    [`${prefix}.self_attn.q_proj.lora_A.weight`]: { shape: [2, 8], data: bf16(Array(16).fill(0.5)) },
    [`${prefix}.self_attn.q_proj.lora_B.weight`]: { shape: [8, 2], data: bf16(Array(16).fill(0.25)) },
  });
  emit({ type: 'complete', message: 'Training completed (fake).', outputDir: finalDir, totalSteps: total, finalStep: total });
}

if (script === '--version') {
  console.log('Python 3.12.0');
} else if (script === '-c') {
  // The import check (transformers, peft, trl): all there.
} else if (script && script.endsWith('train_lora.py')) {
  await fakeTraining();
} else {
  const real = ['python3', 'python'].find((cmd) => spawnSync(cmd, ['--version']).status === 0);
  const run = spawnSync(real, [script, ...args], { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}
