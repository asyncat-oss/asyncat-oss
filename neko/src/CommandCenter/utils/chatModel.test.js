import test from 'node:test';
import assert from 'node:assert/strict';

import {
  agentModelOption,
  chatModelInfo,
  configModelName,
  defaultModelRef,
  localModelName,
  metadataWithRunModel,
  modelBlockReason,
  modelEventPatch,
  modelOptions,
  modelRef,
  modelStatusText,
  sameLocalFile,
  sameModel,
} from './chatModel.js';

const PROFILES = [
  { id: 'p-cloud', name: 'Garden cloud', provider_id: 'openai', model: 'gpt-4o-mini', supports_tools: true, capabilities: { supportsImageInput: true } },
  { id: 'p-router', name: 'Router', provider_id: 'openrouter', model: 'openrouter/auto', supports_tools: false },
  { id: 'p-same', name: 'qwen-plus', provider_id: 'qwen', model: 'qwen-plus' },
  { id: 'p-engine', name: 'Built-in', provider_id: 'llamacpp-builtin', model: 'tiny.gguf' },
];
const FILES = [
  { filename: 'Tiny-Llama-1B-Q4_K_M.gguf', name: 'Tiny-Llama-1B-Q4_K_M', sizeFormatted: '0.7 GB', capabilities: { supportsImageInput: false } },
  { filename: 'Gone.gguf', isMissing: true },
  { filename: 'Tiny-Llama-1B-Q4_K_M.gguf', name: 'duplicate' },
];

test('a reference names a saved model or a model file, and nothing else', () => {
  assert.deepEqual(modelRef({ kind: 'profile', profileId: 7 }), { kind: 'profile', profileId: '7' });
  assert.deepEqual(modelRef({ kind: 'local', file: 'a.gguf', name: '  A  ' }), { kind: 'local', file: 'a.gguf', name: 'A' });
  assert.equal(modelRef({ kind: 'profile' }), null);
  assert.equal(modelRef({ kind: 'cloud', profileId: 'x' }), null);
  assert.equal(modelRef('provider:x'), null);
  assert.equal(modelRef(null), null);
  assert.deepEqual(modelRef({ kind: 'profile', profileId: 'x', name: 'n'.repeat(500) }), { kind: 'profile', profileId: 'x' });
});

test('a local file is the same model whether it is named by path or by file name', () => {
  assert.ok(sameModel({ kind: 'local', file: '/models/Tiny.gguf' }, { kind: 'local', file: 'Tiny.gguf' }));
  assert.ok(sameModel({ kind: 'profile', profileId: 'a', name: 'A' }, { kind: 'profile', profileId: 'a' }));
  assert.ok(!sameModel({ kind: 'profile', profileId: 'a' }, { kind: 'profile', profileId: 'b' }));
  assert.ok(!sameModel({ kind: 'profile', profileId: 'a' }, { kind: 'local', file: 'a' }));
  assert.ok(!sameModel(null, null), 'two defaults are not a known model');
});

test('files kept elsewhere are told apart by their full path', () => {
  assert.ok(sameLocalFile('/cache/a/Tiny.gguf', '/cache/a/Tiny.gguf'));
  assert.ok(!sameLocalFile('/cache/a/Tiny.gguf', '/cache/b/Tiny.gguf'), 'two files with one name');
  assert.ok(sameLocalFile('Tiny.gguf', '/models/Tiny.gguf'), 'a bare name matches by name');
  assert.ok(sameLocalFile('C:\\models\\Tiny.gguf', 'C:/models/Tiny.gguf'));
  assert.ok(!sameLocalFile(null, 'Tiny.gguf'));
  assert.ok(!sameModel({ kind: 'local', file: '/cache/a/Tiny.gguf' }, { kind: 'local', file: '/cache/b/Tiny.gguf' }));
});

test('local models are called by their file name without the extension', () => {
  assert.equal(localModelName('/home/someone/models/Tiny-Llama-1B-Q4_K_M.gguf'), 'Tiny-Llama-1B-Q4_K_M');
  assert.equal(localModelName('C:\\models\\Phi.bin'), 'Phi');
  assert.equal(localModelName('/cache/hub/models--Qwen--Qwen3-0.6B-GGUF/snapshots/abc/Qwen3-0.6B-BF16.gguf'), 'Qwen3-0.6B-BF16', 'the file, not its repo');
  assert.equal(localModelName(''), 'Local model');
});

test('the default model is read from the app-wide config as den reads it', () => {
  assert.deepEqual(defaultModelRef({ profile_id: 'p-cloud', provider_id: 'openai', model: 'gpt-4o-mini' }), { kind: 'profile', profileId: 'p-cloud' });
  assert.deepEqual(defaultModelRef({ profile_id: null, provider_id: 'llamacpp-builtin', model: 'Tiny.gguf' }), { kind: 'local', file: 'Tiny.gguf', name: 'Tiny' });
  assert.equal(defaultModelRef({ provider_id: 'llamacpp-builtin', model: '' }), null, 'no model set up');
  assert.equal(defaultModelRef({ provider_id: 'mlx-builtin', model: 'mlx-community/x' }), null);
  assert.equal(defaultModelRef(null), null);
});

test('the default model is named from the config as the menu names it', () => {
  assert.equal(configModelName({ provider_id: 'llamacpp-builtin', model: '/models/Tiny-Llama-1B-Q4_K_M.gguf' }), 'Tiny-Llama-1B-Q4_K_M');
  assert.equal(configModelName({ provider_id: 'openai', model: 'gpt-4o-mini', settings: {} }), 'gpt-4o-mini');
  assert.equal(configModelName({ provider_id: 'openrouter', model: 'openrouter/auto' }), 'Auto (OpenRouter picks)');
  assert.equal(configModelName({ provider_id: 'custom', model: 'x', settings: { model_name: 'Garden helper' } }), 'Garden helper');
  assert.equal(configModelName({ provider_id: 'llamacpp-builtin', model: '' }), '');
  assert.equal(configModelName(null), '');
});

test('the menu lists saved models by their model, then the files on this computer', () => {
  const options = modelOptions({ profiles: PROFILES, localModels: FILES, loadedFile: '/models/Tiny-Llama-1B-Q4_K_M.gguf' });
  assert.deepEqual(options.map((item) => item.key), ['profile:p-cloud', 'profile:p-router', 'profile:p-same', 'local:Tiny-Llama-1B-Q4_K_M.gguf']);
  const [cloud, router, same, file] = options;
  assert.equal(cloud.label, 'gpt-4o-mini');
  assert.equal(cloud.detail, 'Garden cloud');
  assert.equal(cloud.supportsTools, true);
  assert.equal(router.label, 'Auto (OpenRouter picks)');
  assert.equal(same.detail, '', 'a saved model named after its model says it once');
  assert.deepEqual(file.ref, { kind: 'local', file: 'Tiny-Llama-1B-Q4_K_M.gguf' });
  assert.equal(file.label, 'Tiny-Llama-1B-Q4_K_M');
  assert.equal(file.detail, 'Loaded · 0.7 GB');
  assert.equal(file.isLocal, true);
  assert.equal(file.supportsTools, false);
  assert.deepEqual(modelOptions(), []);
});

test('a linked file or one in the Hugging Face cache is picked by its full path, as Models loads it', () => {
  const kept = [
    { filename: 'Tiny.gguf', path: '/models/Tiny.gguf', sizeFormatted: '0.7 GB' },
    { filename: 'Qwen3-0.6B-BF16.gguf', path: '/cache/hub/a/Qwen3-0.6B-BF16.gguf', isExternal: true, source: 'huggingface-cache' },
    { filename: 'Qwen3-0.6B-BF16.gguf', path: '/cache/hub/b/Qwen3-0.6B-BF16.gguf', isExternal: true, source: 'huggingface-cache' },
    { filename: 'Garden.gguf', name: 'Garden notes', path: '/data/Garden.gguf', isExternal: true },
    { filename: 'Garden.gguf', name: 'Garden notes', path: '/data/Garden.gguf', isExternal: true },
  ];
  const options = modelOptions({ localModels: kept, loadedFile: '/cache/hub/b/Qwen3-0.6B-BF16.gguf' });
  assert.deepEqual(options.map((item) => item.ref.file), [
    'Tiny.gguf',
    '/cache/hub/a/Qwen3-0.6B-BF16.gguf',
    '/cache/hub/b/Qwen3-0.6B-BF16.gguf',
    '/data/Garden.gguf',
  ], 'one entry per file, two files with one name kept apart');
  assert.deepEqual(options.map((item) => item.detail), ['0.7 GB', 'Hugging Face cache', 'Loaded · Hugging Face cache', 'Linked file · Garden notes']);
  const chat = chatModelInfo({ chatRef: { kind: 'local', file: '/cache/hub/b/Qwen3-0.6B-BF16.gguf' }, options, loaded: true });
  assert.equal(chat.missing, false);
  assert.equal(options.filter((item) => sameModel(item.ref, chat.ref)).length, 1, 'only its own file is checked');
});

test("a chat shows its own model, else the default, with that model's abilities", () => {
  const options = modelOptions({ profiles: PROFILES, localModels: FILES });
  const own = chatModelInfo({ chatRef: { kind: 'local', file: '/models/Tiny-Llama-1B-Q4_K_M.gguf' }, defaultRef: { kind: 'profile', profileId: 'p-cloud' }, options, loaded: true });
  assert.equal(own.name, 'Tiny-Llama-1B-Q4_K_M');
  assert.equal(own.followsDefault, false);
  assert.equal(own.isLocal, true);
  assert.equal(own.ref.file, '/models/Tiny-Llama-1B-Q4_K_M.gguf', 'the chat keeps naming its file as it did');

  const fresh = chatModelInfo({ chatRef: null, defaultRef: { kind: 'profile', profileId: 'p-cloud' }, options, loaded: true });
  assert.equal(fresh.name, 'gpt-4o-mini');
  assert.equal(fresh.followsDefault, true);
  assert.equal(fresh.capabilities.supportsImageInput, true);
  assert.deepEqual(fresh.ref, { kind: 'profile', profileId: 'p-cloud', name: 'gpt-4o-mini' });
});

test('a removed model shows by the name it was saved with, and is marked once the lists are in', () => {
  const removed = { kind: 'profile', profileId: 'p-old', name: 'Old cloud · o1' };
  const before = chatModelInfo({ chatRef: removed, options: [], loaded: false });
  assert.equal(before.name, 'Old cloud · o1');
  assert.equal(before.missing, false);
  assert.equal(chatModelInfo({ chatRef: removed, options: modelOptions({ profiles: PROFILES }), loaded: true }).missing, true);
});

test("a model isn't called removed while the list it would be on hasn't loaded", () => {
  const file = { kind: 'local', file: 'Tiny.gguf' };
  const saved = { kind: 'profile', profileId: 'p-old' };
  const onlyProfiles = { profiles: true, local: false };
  assert.equal(chatModelInfo({ chatRef: file, options: [], loaded: onlyProfiles }).missing, false, 'the file list failed to load');
  assert.equal(chatModelInfo({ chatRef: saved, options: [], loaded: onlyProfiles }).missing, true);
  assert.equal(chatModelInfo({ chatRef: saved, options: [], loaded: { profiles: false, local: true } }).missing, false);
  assert.equal(chatModelInfo({ chatRef: file, options: [], loaded: { profiles: true, local: true } }).missing, true);
});

test('a default with no reference is described by the app-wide config', () => {
  const brain = { model: 'Mistral-7B', providerName: 'MLX', isLocal: true, supportsTools: false, capabilities: { supportsReasoning: false } };
  const info = chatModelInfo({ chatRef: null, defaultRef: null, options: [], fallback: brain });
  assert.equal(info.ref, null);
  assert.equal(info.name, 'Mistral-7B');
  assert.equal(info.isLocal, true);
  // The default's own reference, before the lists are in.
  const early = chatModelInfo({ defaultRef: { kind: 'profile', profileId: 'p-cloud' }, fallback: { defaultName: 'gpt-4o-mini', model: 'gpt-4o', supportsTools: true } });
  assert.equal(early.name, 'gpt-4o-mini');
  assert.equal(early.supportsTools, true);
});

test("an agent's own model is found among the saved models", () => {
  const options = modelOptions({ profiles: PROFILES });
  assert.equal(agentModelOption({ model_profile_id: 'p-router' }, options)?.label, 'Auto (OpenRouter picks)');
  assert.equal(agentModelOption({ model_profile_id: null }, options), null);
  assert.equal(agentModelOption(null, options), null);
});

test('only a default without a model file or saved model waits for its server', () => {
  const chosen = { ref: { kind: 'local', file: 'Tiny.gguf' } };
  assert.equal(modelBlockReason({ model: chosen, brain: { isBuiltin: true, status: 'idle', rawModel: 'Other.gguf' } }), null, 'a local model loads when sent');
  const mlx = (patch) => modelBlockReason({ model: { ref: null }, brain: { isBuiltin: true, model: 'Mistral', rawModel: 'mistral', ...patch } });
  assert.equal(mlx({ loading: true }), 'Checking which model is ready…');
  assert.equal(mlx({ isLoadingModel: true }), 'Mistral is still loading.');
  assert.equal(mlx({ isReady: true }), null);
  assert.equal(mlx({ status: 'error' }), "The model couldn't load. Pick another one to keep chatting.");
  assert.equal(mlx({}), "Mistral isn't loaded right now.");
  assert.equal(mlx({ rawModel: '', model: '' }), 'No model yet. Choose one to start chatting.');
  assert.equal(modelBlockReason({ model: { ref: null }, brain: { isBuiltin: false } }), null);
});

test("a run's model events say when this chat's model is loading", () => {
  assert.deepEqual(modelEventPatch({ type: 'model_loading', data: { name: 'Tiny', waitingFor: null } }), { modelLoading: { name: 'Tiny', waitingFor: null } });
  assert.deepEqual(modelEventPatch({ type: 'model_loading', data: { name: 'Tiny', waitingFor: 'Big' } }).modelLoading.waitingFor, 'Big');
  assert.deepEqual(modelEventPatch({ type: 'model_ready', data: {} }), { modelLoading: null });
  assert.deepEqual(modelEventPatch({ type: 'chat_model', data: {} }), { modelLoading: null });
  assert.equal(modelEventPatch({ type: 'delta', data: {} }), null);

  assert.equal(modelStatusText({ name: 'gpt-4o-mini' }), 'gpt-4o-mini');
  assert.equal(modelStatusText({ name: 'Tiny', loading: { name: null } }), 'Loading Tiny…');
  assert.equal(modelStatusText({ name: 'Tiny', loading: { name: 'Tiny', waitingFor: 'Big' } }), 'Waiting to load Tiny…');
  assert.equal(modelStatusText({}), 'Choose a model');
});

test('a chat keeps the default it first ran on, but not an agent\'s own model', () => {
  const ran = { model: { kind: 'profile', profileId: 'p-cloud' }, name: 'Garden cloud · gpt-4o-mini', source: 'default' };
  const metadata = { engine: 'asyncat' };
  assert.deepEqual(metadataWithRunModel(metadata, ran), { engine: 'asyncat', model: { kind: 'profile', profileId: 'p-cloud', name: 'Garden cloud · gpt-4o-mini' } });
  const own = { engine: 'asyncat', model: { kind: 'local', file: 'Tiny.gguf' } };
  assert.equal(metadataWithRunModel(own, ran), own, 'a chat with its own model keeps it');
  assert.equal(metadataWithRunModel(metadata, { ...ran, source: 'agent' }), metadata);
  assert.equal(metadataWithRunModel(metadata, { model: null }), metadata);
  assert.deepEqual(metadataWithRunModel(null, ran).model.profileId, 'p-cloud');
});

test('its words are plain and sentence case', () => {
  const words = [
    modelStatusText({ name: 'x', loading: { name: 'x' } }),
    modelBlockReason({ model: {}, brain: { isBuiltin: true } }),
    localModelName(''),
  ];
  for (const text of words) {
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, text);
    assert.equal(text[0], text[0].toUpperCase(), text);
  }
});
