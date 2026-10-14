// Images → Try it's options in plain terms: the shape (square, wide, tall)
// as a size from the model's own default, which options each engine or
// service honours, what to send for a test image, and the one-line summary.
// Options last for the session: they are kept here, not saved.

export const EMPTY_OPTIONS = Object.freeze({
  shape: 'square',
  negativePrompt: '',
  seed: '',
  steps: '',
  cfg: '',
  sampler: '',
  scheduler: '',
  checkpoint: '',
});

export const SHAPES = [
  { value: 'square', label: 'Square' },
  { value: 'wide', label: 'Wide' },
  { value: 'tall', label: 'Tall' },
];

let sessionOptions = { ...EMPTY_OPTIONS };

/** The options as they were left this session. */
export function savedOptions() {
  return sessionOptions;
}

export function saveOptions(options) {
  sessionOptions = { ...EMPTY_OPTIONS, ...options };
  return sessionOptions;
}

const roundTo64 = (value) => Math.max(64, Math.round(value / 64) * 64);

/** Square d × d; wide 1.5d × d and tall d × 1.5d, in steps of 64. `defaults` is the status's { width, height }. */
export function shapeSize(shape, defaults = {}) {
  const side = Math.min(Number(defaults.width) || 512, Number(defaults.height) || Number(defaults.width) || 512);
  const long = roundTo64(side * 1.5);
  if (shape === 'wide') return { width: long, height: side };
  if (shape === 'tall') return { width: side, height: long };
  return { width: side, height: side };
}

/**
 * Which options a way of making images honours: everything on this
 * computer, plus the scheduler and checkpoint in ComfyUI; what to avoid and
 * the seed with fal and Stability AI; only the shape with OpenAI and Gemini.
 * `size`: the pixel size asked for is the size made (a service picks its
 * own size for the shape).
 */
export function optionFields(provider) {
  const local = provider === 'local' || provider === 'comfyui';
  const seeded = local || provider === 'fal' || provider === 'stability';
  return {
    size: local,
    avoid: seeded,
    seed: seeded,
    steps: local,
    sampler: local,
    scheduler: provider === 'comfyui',
    checkpoint: provider === 'comfyui',
  };
}

function wholeNumber(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return undefined;
  return Number(text);
}

function decimal(value) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

/** What to send with POST /media/images/try: the size, and only the options set that the engine honours. */
export function tryOptions(options = EMPTY_OPTIONS, provider = 'local', defaults = {}) {
  const fields = optionFields(provider);
  const size = shapeSize(options.shape, defaults);
  const payload = { width: size.width, height: size.height };
  const text = (value) => String(value || '').trim() || undefined;
  if (fields.avoid) payload.negativePrompt = text(options.negativePrompt);
  if (fields.seed) payload.seed = wholeNumber(options.seed);
  if (fields.steps) {
    payload.steps = wholeNumber(options.steps);
    payload.cfg = decimal(options.cfg);
  }
  if (fields.sampler) payload.sampler = text(options.sampler);
  if (fields.scheduler) payload.scheduler = text(options.scheduler);
  if (fields.checkpoint) payload.checkpoint = text(options.checkpoint);
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

/** "Square · 512 × 512 · 24 steps · random seed"; with a service, the shape without a size ("Wide"). */
export function optionsSummary(options = EMPTY_OPTIONS, provider = 'local', defaults = {}) {
  const fields = optionFields(provider);
  const shape = SHAPES.find((item) => item.value === options.shape)?.label || 'Square';
  const parts = [shape];
  if (fields.size) {
    const size = shapeSize(options.shape, defaults);
    parts.push(`${size.width} × ${size.height}`);
  }
  if (fields.steps) {
    const steps = wholeNumber(options.steps) ?? defaults.steps;
    if (steps) parts.push(`${steps} steps`);
  }
  if (fields.seed) {
    const seed = wholeNumber(options.seed);
    parts.push(seed === undefined ? 'random seed' : `seed ${seed}`);
  }
  return parts.join(' · ');
}

/** How many options differ from the defaults (shape aside), for the Options button. */
export function changedCount(options = EMPTY_OPTIONS, provider = 'local') {
  const fields = optionFields(provider);
  const set = (value) => String(value ?? '').trim() !== '';
  return [
    fields.avoid && set(options.negativePrompt),
    fields.seed && set(options.seed),
    fields.steps && set(options.steps),
    fields.steps && set(options.cfg),
    fields.sampler && set(options.sampler),
    fields.scheduler && set(options.scheduler),
    fields.checkpoint && set(options.checkpoint),
  ].filter(Boolean).length;
}

/** "512 × 512 · seed 4113 · 6 s" under a finished test image. */
export function resultMeta(image, seconds = null) {
  const parts = [];
  if (image?.width && image?.height) parts.push(`${image.width} × ${image.height}`);
  if (image?.seed !== null && image?.seed !== undefined && image?.seed !== '') parts.push(`seed ${image.seed}`);
  if (Number.isFinite(seconds)) parts.push(`${Math.max(1, Math.round(seconds))} s`);
  return parts.join(' · ');
}

/** Where images open in Files (its Made by Asyncat place, pictures only), at one image when `name` is given. */
export function picturesUrl(name = null) {
  return `/files/made?kind=picture${name ? `&open=${encodeURIComponent(name)}` : ''}`;
}

/** "34 images made". */
export function imagesMadeText(total) {
  const count = Number(total) || 0;
  return `${count} ${count === 1 ? 'image' : 'images'} made`;
}
