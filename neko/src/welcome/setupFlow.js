// First-run setup (/welcome): its steps, when the app opens it, and the
// words it shows for this computer, the models it offers and their downloads.

import { formatBytes } from '../components/ui/progressFormat.js';

export const SETUP_STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'model', label: 'How Asyncat thinks' },
  { id: 'chats', label: 'Bring your chats' },
  { id: 'safety', label: 'How careful Asyncat is' },
  { id: 'done', label: 'Done' },
];

/** The index of the step named in ?step=, or the first. */
export function stepIndex(id) {
  const index = SETUP_STEPS.findIndex((step) => step.id === id);
  return index === -1 ? 0 : index;
}

// Pages a new window lands on; the setup never takes over a link to anything else.
const LANDING = new Set(['/', '/home']);

export function isLandingPath(pathname) {
  return LANDING.has(String(pathname || '/').replace(/\/+$/, '') || '/');
}

/**
 * Whether to open the setup instead of `pathname`: { show } from GET
 * /api/setup, and `engine`, the agent chats were last sent to (localStorage
 * 'asyncat_engine'). Claude Code, Codex or an ACP agent there means
 * Asyncat was used before, without a model of its own.
 */
export function shouldOpenSetup(setup, pathname, engine = null) {
  return Boolean(setup?.show) && isLandingPath(pathname) && (!engine || engine === 'asyncat');
}

// The name a fresh profile gets (den/src/db/seed.js) isn't one to show back.
const PLACEHOLDER_NAMES = new Set(['user']);

/** The profile's name for the name field, unless it is the placeholder. */
export function nameToPrefill(name) {
  const text = String(name || '').trim();
  return PLACEHOLDER_NAMES.has(text.toLowerCase()) ? '' : text;
}

function gpuName(gpu) {
  if (gpu.vendor === 'Apple') return 'Apple silicon';
  const name = String(gpu.name || '').trim();
  // Some cards are only known as "AMD GPU with ROCm detected" and the like.
  if (!name || /detected|\//i.test(name)) return `${gpu.vendor || 'A'} graphics card`;
  return gpu.vendor && !name.toLowerCase().startsWith(gpu.vendor.toLowerCase()) ? `${gpu.vendor} ${name}` : name;
}

/** "16 GB memory · NVIDIA GeForce RTX 4050 (6 GB)" for GET /api/setup/local's hardware. */
export function hardwareText(hardware) {
  if (!hardware) return '';
  const parts = [];
  // The system keeps some memory back, so a "16 GB" computer reports 15.2:
  // round up to the size it was sold as.
  if (hardware.ramBytes) parts.push(`${Math.ceil(hardware.ramBytes / 1024 ** 3 - 0.05)} GB memory`);
  if (hardware.gpu) parts.push(`${gpuName(hardware.gpu)}${hardware.gpu.vramGb ? ` (${hardware.gpu.vramGb} GB)` : ''}`);
  return parts.join(' · ');
}

export const FIT_TEXT = {
  gpu: 'Runs on your graphics card.',
  cpu: 'Runs on the processor, so answers take a little longer.',
  tight: 'Fits, but close other apps while it runs.',
  too_big: 'Probably too big for this computer.',
};

/** What clicking Download fetches: the model unless it is here, and the engine unless installed. */
export function downloadBytes(plan, modelId) {
  const model = plan?.models?.find((item) => item.id === modelId);
  if (!model) return 0;
  const engine = plan.engine && !plan.engine.installed ? Number(plan.engine.bytes) || 0 : 0;
  return (model.installed ? 0 : model.bytes) + engine;
}

/** The button that starts it says how much it downloads. */
export function downloadLabel(bytes) {
  return bytes > 0 ? `Download ${formatBytes(bytes)}` : 'Use this model';
}

const fileName = (value) => String(value || '').split(/[\\/]/).filter(Boolean).pop() || '';

/** "Llama 3.2 3B Instruct" for ".../Llama-3.2-3B-Instruct-Q4_K_M.gguf". */
export function localModelName(value) {
  const file = fileName(value).replace(/\.gguf$/i, '');
  const name = file.replace(/[-_.](?:I?Q\d(?:_[A-Z0-9]+)*|BF16|F16|F32)$/i, '');
  return name.replace(/[-_]+/g, ' ').trim() || file;
}

/** The model that answers chats now, by the name people know it by. */
export function chatModelName(brain) {
  if (!brain?.model) return '';
  return brain.isBuiltin ? localModelName(brain.rawModel || brain.model) : brain.model;
}

/**
 * Where a local model setup is: 'idle' (none, or cancelled), 'running',
 * 'loading' (downloaded, the model is loading), 'ready', 'kept' (downloaded,
 * but something else answers chats) or 'error'. `brain` is
 * useActiveBrainStatus(); until it names the downloaded model it is still
 * catching up, so the model counts as loading rather than ready.
 */
export function localSetupState(job, brain) {
  if (!job || job.status === 'cancelled') return 'idle';
  if (job.status === 'running') return 'running';
  if (job.status === 'error' || job.result?.error) return 'error';
  const file = fileName(job.result?.path);
  const current = fileName(brain?.rawModel);
  // Kept for later: something else answered chats when it finished, or since.
  if (job.result?.reason === 'in_use' || brain?.isBuiltin === false || (file && current && current !== file)) return 'kept';
  if (brain?.status === 'error') return 'error';
  if (!current || brain?.isLoadingModel) return 'loading';
  return 'ready';
}

/** The sentence on the last step, for how chats will be answered. */
export function doneText({ brain, localState, localName = '' }) {
  const answers = brain?.isReady || brain?.isLoadingModel;
  // Something answers chats already, so the download is kept for later (den's loadWhenIdle).
  if (localState === 'running' && answers) return `Ask anything. ${localName || 'Your local model'} keeps downloading; switch to it in Models when it's done.`;
  if (localState === 'running') return "Your model is still downloading. You can look around meanwhile, and start chatting once it's ready.";
  if (answers || localState === 'loading') return 'Ask anything, or open a project when you want Asyncat to work with your files.';
  return 'Choose a model in Models whenever you are ready, then ask anything.';
}

/** Where new chats start (services/chatDefaults.js), one sentence each. */
export const CHAT_MODE_CHOICES = [
  { value: 'plan', label: 'Plan', description: 'Asyncat reads, searches and suggests, and changes nothing.' },
  { value: 'action', label: 'Action', description: 'Asyncat can change files and run commands, and asks before risky steps.' },
  { value: 'last', label: 'The mode you used last', description: 'You switch between Plan and Action in the message box.' },
];

/** The command sandbox's network choices (Settings/sandboxText.js), shorter. */
export const NETWORK_DESCRIPTIONS = {
  open: 'Commands use the network like any program, including Asyncat itself, where they could read your chats.',
  registries: 'Commands can only download packages, from npm, PyPI and the like.',
  off: 'Commands get no network at all.',
};

/** One sentence for the sandbox switch, from GET /api/privacy/sandbox. */
export function sandboxSentence(status) {
  if (!status) return 'Checking…';
  if (status.state === 'unsupported') return "Not available on Windows, so Asyncat asks before every command.";
  if (status.state === 'off') return 'Off: commands can read and change any file your account can.';
  if (status.state === 'unavailable') {
    const reason = String(status.reason || "It can't start on this computer.").trim();
    return `It can't start here: ${reason} Asyncat asks before every command instead.`;
  }
  return "Commands can change files only in your project, and can't read your keys and sign-ins.";
}

/** Under the network choices while the sandbox is on but can't start (Settings/sandboxText.js pendingNote). */
export function networkPendingNote(status) {
  return status?.state === 'unavailable' ? 'This applies once the sandbox can start.' : null;
}

/**
 * Of the local model download the page knows and one den reports, the one
 * to show: a running one, else the one started last. A reading that a
 * finished download is still running came in late, and is ignored.
 */
export function laterJob(known, reported) {
  if (!reported) return known || null;
  if (!known) return reported;
  if (reported.id === known.id) return known.status !== 'running' && reported.status === 'running' ? known : reported;
  if (reported.status === 'running') return reported;
  if (known.status === 'running') return known;
  return String(reported.startedAt || '') > String(known.startedAt || '') ? reported : known;
}
