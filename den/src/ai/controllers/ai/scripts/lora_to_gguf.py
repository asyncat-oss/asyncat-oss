#!/usr/bin/env python3
"""
lora_to_gguf.py — turn a LoRA adapter trained by train_lora.py (Hugging Face
PEFT format) into a GGUF adapter that llama.cpp loads with
`llama-server --lora adapter.gguf`.

Uses the Python standard library only, so it runs without the training
environment. Covers the model families Asyncat's guided training offers:
Llama (and Mistral), Qwen2 and Qwen3.

Usage (called by den/src/training/adapters.js):
    python lora_to_gguf.py <adapter_dir> <out.gguf> [--base-config config.json] [--name NAME]

<adapter_dir> holds adapter_config.json and adapter_model.safetensors, and
base_config.json (the base model's config.json, saved there by train_lora.py)
unless --base-config points at it. Prints one JSON line when done.
"""

import json
import math
import os
import re
import struct
import sys

ARCHS = {
    'LlamaForCausalLM': 'llama',
    'MistralForCausalLM': 'llama',
    'Qwen2ForCausalLM': 'qwen2',
    'Qwen3ForCausalLM': 'qwen3',
}

# Hugging Face module → llama.cpp tensor name (blk.N.<name>.weight).
MODULES = {
    'self_attn.q_proj': 'attn_q',
    'self_attn.k_proj': 'attn_k',
    'self_attn.v_proj': 'attn_v',
    'self_attn.o_proj': 'attn_output',
    'mlp.gate_proj': 'ffn_gate',
    'mlp.up_proj': 'ffn_up',
    'mlp.down_proj': 'ffn_down',
}

PEFT_NAME = re.compile(
    r'^(?:base_model\.model\.)?model\.layers\.(\d+)\.'
    r'(self_attn\.[qkvo]_proj|mlp\.(?:gate|up|down)_proj)\.lora_([AB])(?:\.default)?\.weight$'
)

GGML_F32 = 0
GGML_F16 = 1
GGUF_STRING = 8
GGUF_FLOAT32 = 6
GGUF_UINT32 = 4
ALIGN = 32


class ConvertError(Exception):
    pass


def read_safetensors(path):
    """{name: (dtype, shape, raw bytes)} from a .safetensors file."""
    tensors = {}
    with open(path, 'rb') as f:
        (size,) = struct.unpack('<Q', f.read(8))
        header = json.loads(f.read(size))
        base = 8 + size
        for name, info in header.items():
            if name == '__metadata__':
                continue
            start, end = info['data_offsets']
            f.seek(base + start)
            tensors[name] = (info['dtype'], list(info['shape']), f.read(end - start))
    return tensors


def as_ggml(dtype, raw):
    """(ggml type, bytes): F32 and F16 stay, BF16 widens to F32."""
    if dtype == 'F32':
        return GGML_F32, raw
    if dtype == 'F16':
        return GGML_F16, raw
    if dtype == 'BF16':
        out = bytearray(len(raw) * 2)
        out[2::4] = raw[0::2]
        out[3::4] = raw[1::2]
        return GGML_F32, bytes(out)
    raise ConvertError(f'Unsupported tensor type {dtype}')


def permute_rows(raw, rows, n_head):
    """llama.cpp's q/k reordering for Llama (see LlamaModel.permute in
    llama.cpp's converter), applied to lora_B's rows."""
    if rows % (n_head * 2):
        raise ConvertError(f'{rows} rows do not split into {n_head} heads')
    row_bytes = len(raw) // rows
    half = rows // n_head // 2
    out = bytearray(len(raw))
    for h in range(n_head):
        for j in range(half):
            for s in range(2):
                new = h * 2 * half + j * 2 + s
                old = h * 2 * half + s * half + j
                out[new * row_bytes:(new + 1) * row_bytes] = raw[old * row_bytes:(old + 1) * row_bytes]
    return bytes(out)


def gguf_string(text):
    data = text.encode('utf-8')
    return struct.pack('<Q', len(data)) + data


def gguf_kv(key, kind, value):
    out = gguf_string(key) + struct.pack('<I', kind)
    if kind == GGUF_STRING:
        return out + gguf_string(value)
    if kind == GGUF_FLOAT32:
        return out + struct.pack('<f', value)
    if kind == GGUF_UINT32:
        return out + struct.pack('<I', value)
    raise ConvertError(f'Unsupported metadata type {kind}')


def write_gguf(path, kvs, tensors):
    """GGUF v3: header, metadata, tensor infos, aligned tensor data.
    `tensors` is [(name, ggml_type, shape in PyTorch order, raw bytes)]."""
    infos = b''
    offset = 0
    for name, kind, shape, raw in tensors:
        dims = list(reversed(shape))  # ggml lists the fastest dimension first
        infos += gguf_string(name) + struct.pack('<I', len(dims))
        infos += b''.join(struct.pack('<Q', d) for d in dims)
        infos += struct.pack('<I', kind) + struct.pack('<Q', offset)
        offset += len(raw) + (-len(raw)) % ALIGN
    header = b'GGUF' + struct.pack('<I', 3) + struct.pack('<Q', len(tensors)) + struct.pack('<Q', len(kvs))
    header += b''.join(kvs) + infos
    tmp = f'{path}.part'
    with open(tmp, 'wb') as f:
        f.write(header)
        f.write(b'\0' * ((-len(header)) % ALIGN))
        for _name, _kind, _shape, raw in tensors:
            f.write(raw)
            f.write(b'\0' * ((-len(raw)) % ALIGN))
    os.replace(tmp, path)


def convert(adapter_dir, out_path, base_config_path=None, name=None):
    with open(os.path.join(adapter_dir, 'adapter_config.json'), encoding='utf-8') as f:
        lora = json.load(f)
    if lora.get('use_dora'):
        raise ConvertError('DoRA adapters are not supported.')
    config_path = base_config_path or os.path.join(adapter_dir, 'base_config.json')
    if not os.path.isfile(config_path):
        raise ConvertError("The base model's config.json is missing (base_config.json in the adapter folder).")
    with open(config_path, encoding='utf-8') as f:
        base = json.load(f)

    arch_class = (base.get('architectures') or [''])[0]
    arch = ARCHS.get(arch_class)
    if not arch:
        raise ConvertError(f'{arch_class or "This model"} is not supported yet (Llama, Mistral, Qwen2 and Qwen3 are).')
    n_head = int(base['num_attention_heads'])
    n_head_kv = int(base.get('num_key_value_heads') or n_head)

    weights = os.path.join(adapter_dir, 'adapter_model.safetensors')
    if not os.path.isfile(weights):
        raise ConvertError('adapter_model.safetensors is missing.')
    found = read_safetensors(weights)

    pairs = {}
    for key, (dtype, shape, raw) in found.items():
        match = PEFT_NAME.match(key)
        if not match:
            raise ConvertError(f'Unexpected tensor in the adapter: {key}')
        layer, module, side = match.groups()
        pairs.setdefault((int(layer), module), {})[side] = (dtype, shape, raw)

    rank = int(lora.get('r') or 0)
    alpha = float(lora.get('lora_alpha') or rank or 1)
    if lora.get('use_rslora') and rank:
        alpha = alpha * math.sqrt(rank)  # llama.cpp scales by alpha / rank

    tensors = []
    for (layer, module), sides in sorted(pairs.items()):
        if set(sides) != {'A', 'B'}:
            raise ConvertError(f'Layer {layer} {module} is missing lora_A or lora_B.')
        a_type, a_shape, a_raw = sides['A']
        b_type, b_shape, b_raw = sides['B']
        if len(a_shape) != 2 or len(b_shape) != 2 or a_shape[0] != b_shape[1]:
            raise ConvertError(f'Layer {layer} {module} has shapes {a_shape} and {b_shape}.')
        a_kind, a_data = as_ggml(a_type, a_raw)
        b_kind, b_data = as_ggml(b_type, b_raw)
        if arch == 'llama' and module == 'self_attn.q_proj':
            b_data = permute_rows(b_data, b_shape[0], n_head)
        elif arch == 'llama' and module == 'self_attn.k_proj':
            b_data = permute_rows(b_data, b_shape[0], n_head_kv)
        target = f'blk.{layer}.{MODULES[module]}.weight'
        tensors.append((f'{target}.lora_a', a_kind, a_shape, a_data))
        tensors.append((f'{target}.lora_b', b_kind, b_shape, b_data))
    if not tensors:
        raise ConvertError('The adapter has no LoRA weights.')

    kvs = [
        gguf_kv('general.architecture', GGUF_STRING, arch),
        gguf_kv('general.type', GGUF_STRING, 'adapter'),
        gguf_kv('general.name', GGUF_STRING, name or os.path.basename(os.path.normpath(adapter_dir))),
        gguf_kv('adapter.type', GGUF_STRING, 'lora'),
        gguf_kv('adapter.lora.alpha', GGUF_FLOAT32, alpha),
    ]
    write_gguf(out_path, kvs, tensors)
    return {'arch': arch, 'tensors': len(tensors), 'rank': rank, 'alpha': alpha, 'bytes': os.path.getsize(out_path)}


def main(argv):
    args = list(argv)
    options = {}
    for flag in ('--base-config', '--name'):
        if flag in args:
            i = args.index(flag)
            options[flag] = args[i + 1]
            del args[i:i + 2]
    if len(args) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        result = convert(args[0], args[1], options.get('--base-config'), options.get('--name'))
    except (ConvertError, OSError, ValueError, KeyError) as err:
        print(json.dumps({'type': 'error', 'message': str(err)}), flush=True)
        return 1
    print(json.dumps({'type': 'complete', **result}), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
