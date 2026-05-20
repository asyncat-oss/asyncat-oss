/* eslint-disable react/prop-types */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FolderOpen,
  Image,
  Info,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { visualModelsApi } from '../Settings/settingApi.js';
import { Badge, Panel, SectionHeader } from './modelPageShared.jsx';

const TYPE_META = {
  vision: {
    label: 'Vision',
    title: 'Vision Models',
    subtitle: 'Image understanding · multimodal projectors',
    Icon: Eye,
    empty: 'No vision assets found.',
    hint: 'Use multimodal GGUFs and matching projector files such as mmproj. Place them in data/models/vision/ or add an external path.',
    placeholder: 'Path to .gguf, .mmproj, .bin, .safetensors, or config file...',
  },
  image: {
    label: 'Image',
    title: 'Image Generation',
    subtitle: 'Diffusion checkpoints · LoRA · VAE · ControlNet',
    Icon: Image,
    empty: 'No image generation assets found.',
    hint: 'Store Stable Diffusion, SDXL, Flux, LoRA, VAE, ControlNet, or GGUF diffusion assets here. Runtime support can be added as a separate engine.',
    placeholder: 'Path to .safetensors, .ckpt, .gguf, .onnx, .pt, or config file...',
  },
};

const notifyVisualModelsUpdated = () => {
  window.dispatchEvent(new CustomEvent('asyncat-visual-models-updated'));
};

const VisualModelCard = ({ model, type, highlighted, onDelete }) => {
  const meta = TYPE_META[type] || TYPE_META.vision;
  const Icon = model.isExternal ? FolderOpen : meta.Icon;

  return (
    <div
      id={`visual-card-${type}-${model.id || model.filename}`}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-200 dark:bg-gray-900 midnight:bg-slate-900
      ${model.isMissing
        ? 'border-red-100 dark:border-red-900/40'
        : 'border-gray-100 dark:border-gray-800 midnight:border-slate-800 hover:border-gray-200 dark:hover:border-gray-700 midnight:hover:border-slate-700 hover:shadow-sm'}
      ${highlighted ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 midnight:ring-offset-slate-950' : ''}`}
    >
      <div className="px-5 pt-5 pb-4 flex-1">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500 transition-colors dark:bg-gray-800 dark:text-gray-400 midnight:bg-slate-800 midnight:text-slate-400">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100" title={model.name || model.filename}>
              {model.name || model.filename}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400">{meta.label}</span>
              {model.assetKind && <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">{model.assetKind}</span>}
              {model.extension && <span className="text-[10px] font-medium uppercase text-gray-400 dark:text-gray-500">{model.extension.replace('.', '')}</span>}
              {model.isExternal && <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">External</span>}
              {model.isMissing && <span className="text-[10px] font-medium text-red-500">Missing</span>}
              {model.sizeFormatted && <span className="text-[10px] text-gray-400 dark:text-gray-500">{model.sizeFormatted}</span>}
            </div>
            {model.path && (
              <p className="mt-2 truncate font-mono text-[10px] text-gray-400 dark:text-gray-500" title={model.path}>
                {model.path}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-gray-50 px-5 py-3 dark:border-gray-800 midnight:border-slate-800">
        <div className="flex flex-1 items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          {model.isMissing ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
          {model.isMissing ? 'Path missing' : 'Indexed'}
        </div>
        <button
          onClick={() => onDelete(model)}
          className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400"
          title={model.isExternal ? 'Remove from library' : 'Delete asset'}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const AddPathForm = ({ type, onAdd }) => {
  const meta = TYPE_META[type] || TYPE_META.vision;
  const [pathValue, setPathValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    const p = pathValue.trim();
    if (!p) return;
    setAdding(true);
    setError('');
    try {
      const name = p.split(/[\\/]/).pop()?.replace(/(\.onnx\.json|\.(safetensors|ckpt|gguf|onnx|pt|pth|bin|json|mmproj))$/i, '') || meta.label;
      await visualModelsApi.addCustomPath(name, p, type);
      setPathValue('');
      onAdd?.();
      notifyVisualModelsUpdated();
    } catch (err) {
      setError(err.message || 'Failed to add path');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <FolderOpen className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={pathValue}
            onChange={(e) => setPathValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={meta.placeholder}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600 midnight:border-gray-800/80 midnight:bg-gray-900/50"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!pathValue.trim() || adding}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {adding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
};

const GeneratedPreview = ({ result }) => (
  <div className="min-h-80 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/60">
    {result?.image ? (
      <div className="space-y-2">
        <img src={result.image} alt="Generated result" className="aspect-square w-full rounded-xl object-contain bg-white dark:bg-gray-900" />
        <div className="flex flex-wrap gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
          <span className="rounded bg-white px-1.5 py-0.5 dark:bg-gray-900 midnight:bg-gray-900">{result.width}x{result.height}</span>
          <span className="rounded bg-white px-1.5 py-0.5 dark:bg-gray-900 midnight:bg-gray-900">seed {result.seed}</span>
          <span className="rounded bg-white px-1.5 py-0.5 dark:bg-gray-900 midnight:bg-gray-900">{result.steps} steps</span>
        </div>
      </div>
    ) : (
      <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
        <Image className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-700 midnight:text-gray-600" />
        <p className="max-w-xs text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-gray-400">
          Generated images appear here for quick runtime testing.
        </p>
      </div>
    )}
  </div>
);

const ImagePromptControls = ({
  form, update, models = [], modelValueKey = 'modelPath', modelLabel = 'Model',
  modelPlaceholder = 'No models found', children
}) => (
  <div className="space-y-3">
    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
      Prompt
      <textarea
        value={form.prompt}
        onChange={(e) => update('prompt', e.target.value)}
        rows={4}
        placeholder="A cinematic product photo of a translucent mechanical keyboard on a walnut desk..."
        className="mt-1.5 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600"
      />
    </label>

    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
      Negative Prompt
      <input
        value={form.negativePrompt}
        onChange={(e) => update('negativePrompt', e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600"
      />
    </label>

    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
        {modelLabel}
        <select
          value={form[modelValueKey]}
          onChange={(e) => update(modelValueKey, e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100"
        >
          {!models.length && <option value="">{modelPlaceholder}</option>}
          {models.map(model => (
            <option key={model.path || model} value={model.path || model}>
              {model.name || model.filename || model}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
        Seed
        <input
          value={form.seed}
          onChange={(e) => update('seed', e.target.value)}
          placeholder="Random"
          className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100"
        />
      </label>
    </div>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[
        ['width', 'Width', 256, 2048],
        ['height', 'Height', 256, 2048],
        ['steps', 'Steps', 1, 100],
        ['cfg', 'CFG', 1, 20],
      ].map(([key, label, min, max]) => (
        <label key={key} className="text-xs font-medium text-gray-600 dark:text-gray-300">
          {label}
          <input
            type="number"
            min={min}
            max={max}
            value={form[key]}
            onChange={(e) => update(key, e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100"
          />
        </label>
      ))}
    </div>

    {children}
  </div>
);

const SimpleImageRuntimePanel = () => {
  const [runtime, setRuntime] = useState({ status: 'checking', models: [] });
  const [form, setForm] = useState({
    prompt: '',
    negativePrompt: 'low quality, blurry, distorted',
    modelPath: '',
    width: 512,
    height: 512,
    steps: 24,
    cfg: 7,
    sampler: '',
    seed: '',
  });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const loadRuntime = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const status = await visualModelsApi.simpleImage.getStatus();
      setRuntime(status);
      setForm(prev => ({
        ...prev,
        modelPath: prev.modelPath || status.models?.[0]?.path || '',
      }));
    } catch (err) {
      setRuntime({ status: 'missing', found: false, models: [], error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuntime();
  }, [loadRuntime]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const res = await visualModelsApi.simpleImage.generate(form);
      setResult(res);
    } catch (err) {
      setError(err.message || 'Image generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate = runtime.found && form.prompt.trim() && form.modelPath && !generating;

  return (
    <Panel className="mt-5 p-5">
      <SectionHeader
        title="Simple Image Engine"
        description="Run one local diffusion model with a stable-diffusion.cpp style binary."
        action={
          <button onClick={loadRuntime} disabled={loading || generating} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Check
          </button>
        }
      />

      <div className={`mt-4 rounded-xl border px-4 py-3 text-xs ${
        runtime.found
          ? 'border-green-100 bg-green-50 text-green-800 dark:border-green-900/30 dark:bg-green-950/20 dark:text-green-300'
          : 'border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300'
      }`}>
        <div className="flex items-start gap-2.5">
          {runtime.found ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
          <div className="space-y-1">
            <div className="font-medium">
              {runtime.found ? `Simple engine ready${runtime.binaryPath ? `: ${runtime.binaryPath}` : ''}` : 'Simple image engine not found'}
            </div>
            <div className="leading-5 opacity-90">
              {runtime.found
                ? `${runtime.models?.length || 0} image model${runtime.models?.length === 1 ? '' : 's'} indexed.`
                : 'Install stable-diffusion.cpp, put the sd binary on PATH, or set IMAGEGEN_BINARY_PATH in den/.env. Then add a .safetensors, .ckpt, .gguf, or .bin image model below.'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <ImagePromptControls
            form={form}
            update={update}
            models={runtime.models || []}
            modelValueKey="modelPath"
            modelLabel="Image Model"
            modelPlaceholder="No image models indexed"
          >
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              Sampler
              <input
                value={form.sampler}
                onChange={(e) => update('sampler', e.target.value)}
                placeholder="Optional, e.g. euler_a"
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100"
              />
            </label>

            {error && (
              <div className="flex items-center gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
            >
              {generating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Generating...' : 'Generate Test Image'}
            </button>
          </ImagePromptControls>
        </div>

        <GeneratedPreview result={result} />
      </div>
    </Panel>
  );
};

const ImageGenerationRuntimePanel = () => {
  const [runtime, setRuntime] = useState({ status: 'checking', checkpoints: [], samplers: [], schedulers: [] });
  const [form, setForm] = useState({
    prompt: '',
    negativePrompt: 'low quality, blurry, distorted',
    checkpoint: '',
    width: 768,
    height: 768,
    steps: 24,
    cfg: 7,
    sampler: 'euler',
    scheduler: 'normal',
    seed: '',
  });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const loadRuntime = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const status = await visualModelsApi.comfyui.getStatus();
      setRuntime(status);
      setForm(prev => ({
        ...prev,
        checkpoint: prev.checkpoint || status.checkpoints?.[0] || '',
        sampler: status.samplers?.includes(prev.sampler) ? prev.sampler : (status.samplers?.[0] || 'euler'),
        scheduler: status.schedulers?.includes(prev.scheduler) ? prev.scheduler : (status.schedulers?.[0] || 'normal'),
      }));
    } catch (err) {
      setRuntime({ status: 'offline', found: false, checkpoints: [], samplers: [], schedulers: [], error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuntime();
  }, [loadRuntime]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const res = await visualModelsApi.comfyui.generate(form);
      setResult(res);
    } catch (err) {
      setError(err.message || 'Image generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate = runtime.found && form.prompt.trim() && form.checkpoint && !generating;

  return (
    <Panel className="mt-5 p-5">
      <SectionHeader
        title="Advanced ComfyUI Runtime"
        description="Use ComfyUI when you want graph workflows, custom nodes, LoRAs, ControlNet, or advanced pipelines."
        action={
          <button onClick={loadRuntime} disabled={loading || generating} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Check
          </button>
        }
      />

      <div className={`mt-4 rounded-xl border px-4 py-3 text-xs ${
        runtime.found
          ? 'border-green-100 bg-green-50 text-green-800 dark:border-green-900/30 dark:bg-green-950/20 dark:text-green-300'
          : 'border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300'
      }`}>
        <div className="flex items-start gap-2.5">
          {runtime.found ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
          <div className="space-y-1">
            <div className="font-medium">
              {runtime.found ? `ComfyUI ready at ${runtime.baseUrl}` : `ComfyUI not detected${runtime.baseUrl ? ` at ${runtime.baseUrl}` : ''}`}
            </div>
            <div className="leading-5 opacity-90">
              {runtime.found
                ? `${runtime.checkpoints?.length || 0} checkpoint${runtime.checkpoints?.length === 1 ? '' : 's'} available.`
                : 'Run ComfyUI locally, put checkpoints in ComfyUI/models/checkpoints, then refresh. Asyncat uses COMFYUI_BASE_URL or http://127.0.0.1:8188 by default.'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
            Prompt
            <textarea
              value={form.prompt}
              onChange={(e) => update('prompt', e.target.value)}
              rows={4}
              placeholder="A cinematic product photo of a translucent mechanical keyboard on a walnut desk..."
              className="mt-1.5 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600"
            />
          </label>

          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
            Negative Prompt
            <input
              value={form.negativePrompt}
              onChange={(e) => update('negativePrompt', e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              Checkpoint
              <select
                value={form.checkpoint}
                onChange={(e) => update('checkpoint', e.target.value)}
                disabled={!runtime.found}
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100"
              >
                {!runtime.checkpoints?.length && <option value="">No checkpoints found</option>}
                {(runtime.checkpoints || []).map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>

            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              Seed
              <input
                value={form.seed}
                onChange={(e) => update('seed', e.target.value)}
                placeholder="Random"
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['width', 'Width', 256, 2048],
              ['height', 'Height', 256, 2048],
              ['steps', 'Steps', 1, 80],
              ['cfg', 'CFG', 1, 20],
            ].map(([key, label, min, max]) => (
              <label key={key} className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {label}
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={form[key]}
                  onChange={(e) => update(key, e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100"
                />
              </label>
            ))}
          </div>

          {(runtime.samplers?.length > 0 || runtime.schedulers?.length > 0) && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Sampler
                <select value={form.sampler} onChange={(e) => update('sampler', e.target.value)} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100">
                  {(runtime.samplers || ['euler']).map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Scheduler
                <select value={form.scheduler} onChange={(e) => update('scheduler', e.target.value)} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100">
                  {(runtime.schedulers || ['normal']).map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {generating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? 'Generating...' : 'Generate Test Image'}
          </button>
        </div>

        <div className="min-h-80 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/60">
          {result?.image ? (
<div className="space-y-2">
 <img src={result.image} alt="Generated result" className="aspect-square w-full rounded-xl object-contain bg-white dark:bg-gray-900 midnight:bg-slate-900" />
               <div className="flex flex-wrap gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                 <span className="rounded bg-white px-1.5 py-0.5 dark:bg-gray-900 midnight:bg-gray-900">{result.width}x{result.height}</span>
                 <span className="rounded bg-white px-1.5 py-0.5 dark:bg-gray-900 midnight:bg-gray-900">seed {result.seed}</span>
                 <span className="rounded bg-white px-1.5 py-0.5 dark:bg-gray-900 midnight:bg-gray-900">{result.steps} steps</span>
               </div>
             </div>
           ) : (
             <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
               <Image className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-700 midnight:text-gray-600" />
               <p className="max-w-xs text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                Generated images appear here for quick runtime testing.
              </p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
};

const VisualColumn = ({ type, models, loading, highlightedItem, onDelete, onReload }) => {
  const meta = TYPE_META[type] || TYPE_META.vision;
  const Icon = meta.Icon;

  return (
    <Panel className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 midnight:border-slate-700 midnight:bg-slate-800 midnight:text-slate-400">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">{meta.title}</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{meta.subtitle}</p>
          </div>
        </div>
        {models.length > 0 && <Badge color="gray">{models.length}</Badge>}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          {[1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800/50" />)}
        </div>
      ) : models.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white/70 px-4 py-8 text-center dark:border-gray-800 dark:bg-gray-900/50">
          <Icon className="mb-2 h-6 w-6 text-gray-300 dark:text-gray-600 midnight:text-gray-500" />
          <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
            {meta.empty}<br />
            <span className="text-gray-400 dark:text-gray-500 midnight:text-gray-500">{meta.hint}</span>
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {models.map(model => (
            <VisualModelCard
              key={model.id || model.filename}
              model={model}
              type={type}
              highlighted={highlightedItem?.type === type && String(highlightedItem.id) === String(model.id || model.filename)}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      <AddPathForm type={type} onAdd={onReload} />
    </Panel>
  );
};

const VisualModelsSection = ({ mode = 'all', highlightedItem = null, onModelsChange }) => {
  const [models, setModels] = useState({ vision: [], image: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await visualModelsApi.listModels();
      const nextModels = {
        vision: res.vision || [],
        image: res.image || [],
      };
      setModels(nextModels);
      onModelsChange?.(nextModels);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load visual models');
    } finally {
      setLoading(false);
    }
  }, [onModelsChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const refresh = () => loadData();
    window.addEventListener('asyncat-visual-models-updated', refresh);
    return () => window.removeEventListener('asyncat-visual-models-updated', refresh);
  }, [loadData]);

  const handleDelete = async (model) => {
    try {
      await visualModelsApi.deleteModel(model.id || model.filename, model.type);
      await loadData();
      notifyVisualModelsUpdated();
    } catch (err) {
      setError(err.message || 'Failed to remove visual model');
    }
  };

  const showVision = mode === 'all' || mode === 'vision';
  const showImage = mode === 'all' || mode === 'image';
  const total = showVision && showImage
    ? models.vision.length + models.image.length
    : showVision
      ? models.vision.length
      : models.image.length;
  const title = mode === 'vision'
    ? 'Vision Models'
    : mode === 'image'
      ? 'Image Generation'
      : 'Vision & Image Models';
  const description = mode === 'vision'
    ? 'Catalog image-understanding assets such as multimodal projectors and vision encoders.'
    : mode === 'image'
      ? 'Catalog diffusion assets and test local image generation engines.'
      : 'Catalog assets for image understanding and local image generation workflows.';

  return (
    <div>
      <SectionHeader
        title={title}
        description={description}
        action={
          <div className="flex items-center gap-2">
            {total > 0 && <Badge color="gray">{total} Asset{total !== 1 ? 's' : ''}</Badge>}
            <button onClick={loadData} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800">
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      {showImage && (
        <>
          <SimpleImageRuntimePanel />
          <ImageGenerationRuntimePanel />
        </>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
          <span className="flex-1 text-gray-700 dark:text-gray-200">{error}</span>
          <button onClick={() => setError('')} className="text-xs font-medium text-gray-400 hover:opacity-70">x</button>
        </div>
      )}

      <div className={`mt-5 grid grid-cols-1 gap-6 ${showVision && showImage ? 'lg:grid-cols-2' : ''}`}>
        {showVision && <VisualColumn type="vision" models={models.vision} loading={loading} highlightedItem={highlightedItem} onDelete={handleDelete} onReload={loadData} />}
        {showImage && <VisualColumn type="image" models={models.image} loading={loading} highlightedItem={highlightedItem} onDelete={handleDelete} onReload={loadData} />}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 midnight:bg-slate-900">
        <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
          <Info className="h-3 w-3 text-gray-400 dark:text-gray-500" />
        </div>
        <div className="space-y-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400 midnight:text-gray-400">
          {showVision && (
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-200 midnight:text-gray-200">Vision:</span>{' '}
              Multimodal setups usually need a language model plus a matching projector or vision encoder. Keep those assets separate from image generation checkpoints.
            </div>
          )}
          {showImage && (
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-200 midnight:text-gray-200">Image generation:</span>{' '}
              Use the Simple engine for stable-diffusion.cpp style one-model generation, or ComfyUI for advanced graph workflows.
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-gray-400 midnight:text-gray-400" />
            Search above for terms like <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px] dark:bg-gray-800 midnight:bg-gray-800">mmproj</code>, <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px] dark:bg-gray-800 midnight:bg-gray-800">llava</code>, <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px] dark:bg-gray-800 midnight:bg-gray-800">flux gguf</code>, or <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px] dark:bg-gray-800 midnight:bg-gray-800">sdxl safetensors</code>.
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualModelsSection;
