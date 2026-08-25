const IMAGE_MARKERS = [
  'text-to-image',
  'image-generation',
  'stable-diffusion',
  'stable_diffusion',
  'sdxl',
  'flux',
  'diffusion',
  'controlnet',
  'lora',
  'vae',
];

const IMAGE_EXTENSIONS = [
  '.safetensors',
  '.ckpt',
  '.gguf',
  '.onnx',
  '.pt',
  '.pth',
  '.bin',
  '.json',
];

const lower = (value) => String(value || '').toLowerCase();

export const HUGGING_FACE_MODEL_SORTS = [
  'downloads',
  'trendingScore',
  'lastModified',
  'createdAt',
  'likes',
];

export const normalizeHuggingFaceModelSort = (value) => {
  const requested = String(value || '');
  return HUGGING_FACE_MODEL_SORTS.includes(requested) ? requested : 'downloads';
};

const hasExtension = (filename, extensions) => (
  extensions.some(extension => lower(filename).endsWith(extension))
);

const metadataContext = ({ repoId = '', pipelineTag = '', tags = [] } = {}) => (
  [repoId, pipelineTag, ...(Array.isArray(tags) ? tags : [])].map(lower).join(' ')
);

const fileContext = (filename, metadata = {}) => (
  `${metadataContext(metadata)} ${lower(filename)}`
);

const isImageContext = (context) => IMAGE_MARKERS.some(marker => context.includes(marker));

const isWhisperGgmlFilename = (filename) => [
  'ggml-tiny',
  'ggml-base',
  'ggml-small',
  'ggml-medium',
  'ggml-large',
].some(prefix => lower(filename).startsWith(prefix));

const isLegacyGgmlModel = (filename, context) => (
  lower(filename).endsWith('.bin') && (
    lower(filename).startsWith('ggml-') ||
    context.includes('ggml') ||
    context.includes('llama.cpp') ||
    context.includes('llamacpp') ||
    context.includes('gpt4all')
  )
);

/**
 * Return the Asyncat libraries that can consume a concrete Hugging Face file.
 * Generic Transformers weights are intentionally excluded: downloading one
 * safetensors/bin shard does not create a runnable llama.cpp model.
 */
export const classifyHuggingFaceFile = (filename, metadata = {}) => {
  const name = lower(filename);
  const context = fileContext(filename, metadata);
  const imageLike = isImageContext(context);
  const whisperLike = context.includes('whisper') || isWhisperGgmlFilename(name);
  const piperLike = context.includes('piper') || context.includes('piper-voices');
  const targets = [];

  if ((name.endsWith('.gguf') || isLegacyGgmlModel(name, context)) && !whisperLike && !imageLike) {
    targets.push('model');
  }

  if ((name.endsWith('.bin') || name.endsWith('.gguf')) && whisperLike) {
    targets.push('whisper');
  }

  if ((name.endsWith('.onnx') || name.endsWith('.onnx.json')) && piperLike) {
    targets.push('tts');
  }

  if (imageLike && hasExtension(name, IMAGE_EXTENSIONS)) {
    targets.push('image');
  }

  return targets;
};

const isPrimaryRuntimeFile = (filename, targets) => {
  const name = lower(filename);
  if (targets.includes('model') || targets.includes('whisper')) return name.endsWith('.gguf') || name.endsWith('.bin');
  if (targets.includes('tts')) return name.endsWith('.onnx') && !name.endsWith('.onnx.json');
  if (targets.includes('image')) return !name.endsWith('.json');
  return false;
};

const formatForFile = (filename) => {
  const name = lower(filename);
  if (name.endsWith('.gguf')) return 'GGUF';
  if (name.endsWith('.safetensors')) return 'SafeTensors';
  if (name.endsWith('.ckpt')) return 'Checkpoint';
  if (name.endsWith('.onnx') || name.endsWith('.onnx.json')) return 'ONNX';
  if (name.endsWith('.bin')) return 'GGML';
  if (name.endsWith('.pt') || name.endsWith('.pth')) return 'PyTorch';
  return null;
};

export const summarizeHuggingFaceModel = (model = {}) => {
  const repoId = model.id || model.repoId || model.modelId || '';
  const metadata = {
    repoId,
    pipelineTag: model.pipeline_tag || model.pipelineTag || '',
    tags: model.tags || [],
  };
  const siblings = Array.isArray(model.siblings) ? model.siblings : [];
  const compatibleFiles = siblings
    .map(file => typeof file === 'string' ? file : file?.rfilename)
    .filter(Boolean)
    .map(rfilename => ({
      rfilename,
      targetKinds: classifyHuggingFaceFile(rfilename, metadata),
    }))
    .filter(file => file.targetKinds.length > 0);
  const primaryFiles = compatibleFiles.filter(file => isPrimaryRuntimeFile(file.rfilename, file.targetKinds));

  return {
    compatible: primaryFiles.length > 0,
    compatibleFileCount: compatibleFiles.length,
    targetKinds: [...new Set(primaryFiles.flatMap(file => file.targetKinds))],
    formats: [...new Set(primaryFiles.map(file => formatForFile(file.rfilename)).filter(Boolean))],
  };
};
