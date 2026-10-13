import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// scripts/lora_to_gguf.py turns a trained LoRA adapter (PEFT safetensors)
// into the GGUF adapter llama-server loads with --lora. A tiny adapter is
// written here, converted, and the GGUF read back byte by byte.

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, '..', 'src', 'ai', 'controllers', 'ai', 'scripts', 'lora_to_gguf.py');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-lora-'));
const python = ['python3', 'python'].find((cmd) => spawnSync(cmd, ['--version']).status === 0);

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function bf16(values) {
  const out = Buffer.alloc(values.length * 2);
  const f = new Float32Array(1);
  const u = new Uint32Array(f.buffer);
  values.forEach((value, i) => { f[0] = value; out.writeUInt16LE(u[0] >>> 16, i * 2); });
  return out;
}

function f32(values) {
  const out = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => out.writeFloatLE(value, i * 4));
  return out;
}

function writeSafetensors(file, tensors) {
  const header = {};
  const parts = [];
  let offset = 0;
  for (const [name, { dtype, shape, data }] of Object.entries(tensors)) {
    header[name] = { dtype, shape, data_offsets: [offset, offset + data.length] };
    parts.push(data);
    offset += data.length;
  }
  const json = Buffer.from(JSON.stringify(header));
  const size = Buffer.alloc(8);
  size.writeBigUInt64LE(BigInt(json.length));
  fs.writeFileSync(file, Buffer.concat([size, json, ...parts]));
}

function readGguf(file) {
  const buf = fs.readFileSync(file);
  let pos = 0;
  const u32 = () => { const v = buf.readUInt32LE(pos); pos += 4; return v; };
  const u64 = () => { const v = Number(buf.readBigUInt64LE(pos)); pos += 8; return v; };
  const str = () => { const n = u64(); const s = buf.toString('utf8', pos, pos + n); pos += n; return s; };
  assert.equal(buf.toString('latin1', 0, 4), 'GGUF');
  pos = 4;
  const version = u32();
  const nTensors = u64();
  const nKv = u64();
  const kv = {};
  for (let i = 0; i < nKv; i++) {
    const key = str();
    const type = u32();
    if (type === 8) kv[key] = str();
    else if (type === 6) { kv[key] = buf.readFloatLE(pos); pos += 4; } else throw new Error(`type ${type}`);
  }
  const infos = [];
  for (let i = 0; i < nTensors; i++) {
    const name = str();
    const nDims = u32();
    const dims = Array.from({ length: nDims }, u64);
    infos.push({ name, dims, type: u32(), offset: u64() });
  }
  const dataStart = pos + ((32 - (pos % 32)) % 32);
  const tensors = {};
  for (const info of infos) {
    const count = info.dims.reduce((a, b) => a * b, 1);
    const start = dataStart + info.offset;
    tensors[info.name] = { ...info, values: Array.from({ length: count }, (_, i) => buf.readFloatLE(start + i * 4)) };
  }
  return { version, kv, tensors };
}

function makeAdapter(dir, { arch, heads = 2, kvHeads = 1 }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'adapter_config.json'), JSON.stringify({ r: 2, lora_alpha: 4, peft_type: 'LORA' }));
  fs.writeFileSync(path.join(dir, 'base_config.json'), JSON.stringify({ architectures: [arch], num_attention_heads: heads, num_key_value_heads: kvHeads, hidden_size: 8 }));
  const prefix = 'base_model.model.model.layers.0';
  // B rows hold their own index so the reordering is easy to read back.
  const rowsOf = (n) => Array.from({ length: n * 2 }, (_, i) => Math.floor(i / 2));
  writeSafetensors(path.join(dir, 'adapter_model.safetensors'), {
    [`${prefix}.self_attn.q_proj.lora_A.weight`]: { dtype: 'BF16', shape: [2, 8], data: bf16([1.5, -2, 0.25, 0, 1, 2, 3, 4, 5, 6, 7, 8, -1, -0.5, 0.125, 9]) },
    [`${prefix}.self_attn.q_proj.lora_B.weight`]: { dtype: 'BF16', shape: [8, 2], data: bf16(rowsOf(8)) },
    [`${prefix}.self_attn.k_proj.lora_A.weight`]: { dtype: 'BF16', shape: [2, 8], data: bf16(Array(16).fill(1)) },
    [`${prefix}.self_attn.k_proj.lora_B.weight`]: { dtype: 'BF16', shape: [4, 2], data: bf16(rowsOf(4)) },
    [`${prefix}.mlp.down_proj.lora_A.weight`]: { dtype: 'F32', shape: [2, 16], data: f32(Array(32).fill(0.5)) },
    [`${prefix}.mlp.down_proj.lora_B.weight`]: { dtype: 'F32', shape: [8, 2], data: f32(Array(16).fill(-0.5)) },
  });
}

const rowIds = (tensor) => tensor.values.filter((_, i) => i % 2 === 0);

test('a Llama adapter becomes a GGUF adapter with llama.cpp names, shapes and q/k order', { skip: !python && 'no python here' }, () => {
  const dir = path.join(scratch, 'llama');
  makeAdapter(dir, { arch: 'LlamaForCausalLM' });
  const out = path.join(scratch, 'llama.gguf');
  const line = execFileSync(python, [SCRIPT, dir, out, '--name', 'Garden tone'], { encoding: 'utf8' });
  assert.equal(JSON.parse(line).type, 'complete');

  const gguf = readGguf(out);
  assert.equal(gguf.version, 3);
  assert.equal(gguf.kv['general.architecture'], 'llama');
  assert.equal(gguf.kv['general.type'], 'adapter');
  assert.equal(gguf.kv['adapter.type'], 'lora');
  assert.equal(gguf.kv['adapter.lora.alpha'], 4);
  assert.equal(gguf.kv['general.name'], 'Garden tone');

  const qa = gguf.tensors['blk.0.attn_q.weight.lora_a'];
  assert.deepEqual(qa.dims, [8, 2], 'ggml lists the input size first');
  assert.equal(qa.type, 0);
  assert.deepEqual(qa.values.slice(0, 4), [1.5, -2, 0.25, 0], 'bf16 values carried over exactly');
  const qb = gguf.tensors['blk.0.attn_q.weight.lora_b'];
  assert.deepEqual(qb.dims, [2, 8]);
  assert.deepEqual(rowIds(qb), [0, 2, 1, 3, 4, 6, 5, 7], 'q rows reordered per head like llama.cpp does');
  assert.deepEqual(rowIds(gguf.tensors['blk.0.attn_k.weight.lora_b']), [0, 2, 1, 3], 'k uses the key/value heads');
  assert.deepEqual(gguf.tensors['blk.0.ffn_down.weight.lora_a'].dims, [16, 2]);
  assert.equal(Object.keys(gguf.tensors).length, 6);
});

test('Qwen3 keeps q/k rows as they are, and unknown models are refused', { skip: !python && 'no python here' }, () => {
  const dir = path.join(scratch, 'qwen3');
  makeAdapter(dir, { arch: 'Qwen3ForCausalLM' });
  const out = path.join(scratch, 'qwen3.gguf');
  execFileSync(python, [SCRIPT, dir, out]);
  const gguf = readGguf(out);
  assert.equal(gguf.kv['general.architecture'], 'qwen3');
  assert.deepEqual(rowIds(gguf.tensors['blk.0.attn_q.weight.lora_b']), [0, 1, 2, 3, 4, 5, 6, 7]);

  const odd = path.join(scratch, 'odd');
  makeAdapter(odd, { arch: 'GemmaForCausalLM' });
  const run = spawnSync(python, [SCRIPT, odd, path.join(scratch, 'odd.gguf')], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(JSON.parse(run.stdout).message, /not supported yet/);
  assert.equal(fs.existsSync(path.join(scratch, 'odd.gguf')), false);
});
