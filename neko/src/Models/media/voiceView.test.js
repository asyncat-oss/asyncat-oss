import test from 'node:test';
import assert from 'node:assert/strict';
import {
  draftChoice, downloadBlockedReason, failedRow, firstRunAction, firstRunOptions, firstRunPicks, groupHint, isFirstRun, leftOutText, listeningInUse,
  mergeSteps, partProblem, pickedVoice, pickedWhisper, rowSteps, runsOnChange, setupNames, setupOutcome, switchedText, voiceInUse, voiceStatusLines,
} from './voiceView.js';

const catalog = {
  whisper: [
    { id: 'base', title: 'Base', file: 'ggml-base-q5_1.bin', englishFile: 'ggml-base.en-q5_1.bin', bytes: 59_700_000, recommended: true },
    { id: 'small', title: 'Small', file: 'ggml-small-q5_1.bin', englishFile: 'ggml-small.en-q5_1.bin', bytes: 190_100_000 },
  ],
  voices: [
    { id: 'en_US-lessac-medium', name: 'Lessac', language: 'English (US)', locale: 'en-US', recommended: true, bytes: 63_200_000 },
    { id: 'en_US-amy-medium', name: 'Amy', language: 'English (US)', locale: 'en-US', bytes: 63_200_000 },
    { id: 'de_DE-thorsten-medium', name: 'Thorsten', language: 'German', locale: 'de-DE', bytes: 63_200_000 },
  ],
  cloud: {
    openai: { title: 'OpenAI', keyName: 'OPENAI_API_KEY', hasKey: false, stt: { defaultModel: 'gpt-4o-transcribe' }, tts: { defaultVoice: 'coral' } },
    gemini: { title: 'Gemini', keyName: 'GEMINI_API_KEY', hasKey: true, stt: null, tts: { defaultVoice: 'Aoede' } },
  },
};

const library = {
  whisper: [
    { filename: 'ggml-base.en-q5_1.bin', path: '/m/audio/whisper/ggml-base.en-q5_1.bin', sizeBytes: 59_700_000 },
    { filename: 'ggml-medium.bin', path: '/data/ggml-medium.bin', sizeBytes: 1_530_000_000, isExternal: true },
  ],
  tts: [
    { filename: 'en_US-amy-medium.onnx', path: '/m/audio/tts/en_US-amy-medium.onnx', sizeBytes: 63_100_000 },
  ],
};

const fresh = {
  stt: { provider: 'local', engine: false, model: null, ready: false, reason: 'needs_engine' },
  tts: { provider: 'local', engine: false, voice: null, ready: false, reason: 'needs_engine' },
  setUp: false,
};

const ready = {
  stt: { provider: 'local', engine: true, model: { path: '/m/audio/whisper/ggml-base.en-q5_1.bin', name: 'Base (English)' }, ready: true, running: 'idle' },
  tts: { provider: 'local', engine: true, voice: { path: '/m/audio/tts/en_US-amy-medium.onnx', id: 'en_US-amy-medium' }, ready: true },
  setUp: true,
};

test('the first run is nothing working, nothing running, and nothing on a service', () => {
  assert.equal(isFirstRun(fresh), true);
  assert.equal(isFirstRun(fresh, { status: 'running' }), false);
  assert.equal(isFirstRun(ready), false);
  // Listening turned off still leaves speaking to set up.
  assert.equal(isFirstRun({ ...fresh, stt: { provider: 'off', ready: false, reason: 'off' } }), true);
  // Both off is not a first run: voice is off.
  assert.equal(isFirstRun({ stt: { provider: 'off', ready: false }, tts: { provider: 'off', ready: false } }), false);
  // A saved service, even without its key, is past the first run.
  assert.equal(isFirstRun({ ...fresh, stt: { provider: 'openai', ready: false, reason: 'needs_key', title: 'OpenAI' } }), false);
  assert.equal(isFirstRun(null), false);
});

test('a part that does not work says what it needs', () => {
  assert.equal(partProblem('stt', { provider: 'openai', title: 'OpenAI', ready: false, reason: 'needs_key' }), 'Listening needs your OpenAI key.');
  assert.equal(partProblem('stt', { provider: 'local', engine: false, model: { path: '/a' }, ready: false, reason: 'needs_engine' }), 'Listening needs its engine.');
  assert.equal(partProblem('stt', { provider: 'local', engine: true, model: null, ready: false, reason: 'needs_model' }), 'Listening needs a model.');
  assert.equal(partProblem('tts', { provider: 'local', engine: true, voice: null, ready: false, reason: 'needs_voice' }), 'Speaking needs a voice.');
  assert.equal(partProblem('tts', { provider: 'local', engine: false, voice: null, ready: false, reason: 'needs_engine' }), 'Speaking needs its engine and a voice.');
  assert.equal(partProblem('tts', { provider: 'off', ready: false }), null);
  assert.equal(partProblem('stt', ready.stt), null);
});

test('status lines: loading failed, setting up, outcomes, off and problems', () => {
  assert.deepEqual(voiceStatusLines({ loadError: 'boom' }).map((line) => [line.text, line.action]), [["Couldn't load voice settings.", 'reload']]);
  assert.deepEqual(voiceStatusLines({}), []);

  const job = { status: 'running', steps: [{ status: 'done', total: 100 }, { status: 'running', total: 100, progress: 50 }] };
  const running = voiceStatusLines({ status: fresh, job });
  assert.deepEqual(running.map((line) => [line.tone, line.text, line.percent, line.action]), [['progress', 'Setting up voice · 75%', 75, 'cancel']]);

  assert.deepEqual(voiceStatusLines({ status: ready, outcome: 'complete' }).map((line) => line.text), ['Voice is set up']);
  // A setup for one part says which.
  assert.deepEqual(voiceStatusLines({ status: ready, outcome: 'complete', job: { status: 'complete', options: { listen: false, speak: true } } }).map((line) => line.text), ['Speaking is set up']);
  assert.deepEqual(voiceStatusLines({ status: ready, outcome: 'complete', job: { status: 'complete', options: { listen: true, speak: false } } }).map((line) => line.text), ['Listening is set up']);
  assert.deepEqual(voiceStatusLines({ status: ready, outcome: 'error' }).map((line) => [line.text, line.action]), [["Setup didn't finish.", 'retry']]);
  assert.deepEqual(voiceStatusLines({ status: ready, outcome: 'cancelled' }).map((line) => [line.tone, line.action]), [['off', 'setup']]);
  // On the first run the download button under the groups starts it again.
  assert.deepEqual(voiceStatusLines({ status: fresh, outcome: 'error', firstRun: true }).map((line) => [line.text, line.action]), [["Setup didn't finish.", undefined]]);
  assert.deepEqual(voiceStatusLines({ status: fresh, outcome: 'cancelled', firstRun: true }).map((line) => [line.text, line.action]), [['Setup cancelled.', undefined]]);
  assert.deepEqual(voiceStatusLines({ status: fresh, firstRun: true, planError: 'offline' }).map((line) => line.action), ['plan']);

  const off = { stt: { provider: 'off', ready: false }, tts: { provider: 'off', ready: false }, setUp: false };
  assert.deepEqual(voiceStatusLines({ status: off }).map((line) => [line.tone, line.text]), [['off', 'Voice is off.']]);

  const needs = { ...ready, tts: { provider: 'openai', title: 'OpenAI', ready: false, reason: 'needs_key' }, setUp: false };
  assert.deepEqual(voiceStatusLines({ status: needs }).map((line) => line.text), ['Speaking needs your OpenAI key.']);
  // The group being changed speaks for itself.
  assert.deepEqual(voiceStatusLines({ status: needs, drafts: { tts: { provider: 'gemini' } } }), []);
  // The first run has its own words, not problems.
  assert.deepEqual(voiceStatusLines({ status: fresh, firstRun: true }), []);
  // A setup that stopped speaks for what is still missing.
  assert.deepEqual(voiceStatusLines({ status: needs, outcome: 'error' }).map((line) => line.text), ["Setup didn't finish."]);
});

test('a finished setup is reported where it was followed, or when it failed and voice still is not set up', () => {
  const done = { id: 'a', status: 'complete' };
  assert.equal(setupOutcome(done, { followedId: 'a' }), 'complete');
  assert.equal(setupOutcome(done, { followedId: 'a', quietId: 'a' }), null);
  assert.equal(setupOutcome(done, {}), null);
  assert.equal(setupOutcome({ id: 'b', status: 'error' }, { status: fresh }), 'error');
  assert.equal(setupOutcome({ id: 'b', status: 'error' }, { status: ready }), null);
  assert.equal(setupOutcome({ id: 'c', status: 'cancelled' }, { status: fresh }), null);
  assert.equal(setupOutcome({ id: 'c', status: 'running' }, { followedId: 'c' }), null);
});

test('a voice and its settings file read as one row, planned or downloading', () => {
  const plan = rowSteps([
    { key: 'whisper-engine', done: false, bytes: 12_000_000 },
    { key: 'whisper-model', done: true, bytes: 59_700_000 },
    { key: 'voice', done: false, bytes: 63_200_000 },
    { key: 'voice-config', done: false, bytes: 5_000, small: true },
  ]);
  assert.equal(plan.sttEngine.bytes, 12_000_000);
  assert.equal(plan.sttModel.done, true);
  assert.equal(plan.ttsEngine, null);
  assert.deepEqual([plan.ttsVoice.done, plan.ttsVoice.bytes, plan.ttsVoice.estimated], [false, 63_205_000, false]);

  const voice = mergeSteps([
    { key: 'voice', status: 'done', total: 60, downloaded: 60 },
    { key: 'voice-config', status: 'waiting', total: 5 },
  ]);
  assert.deepEqual([voice.status, voice.downloaded, voice.total], ['running', 60, 65]);
  assert.equal(mergeSteps([{ key: 'voice', status: 'skipped' }, { key: 'voice-config', status: 'skipped' }]).status, 'skipped');
  assert.equal(mergeSteps([{ key: 'voice', status: 'waiting' }, { key: 'voice-config', status: 'waiting' }]).status, 'waiting');
  assert.equal(mergeSteps([{ key: 'voice', status: 'done' }, { key: 'voice-config', status: 'error', error: 'Gone' }]).error, 'Gone');
});

test('a failed setup names the row it failed on', () => {
  const job = { status: 'error', steps: [{ key: 'whisper-engine', status: 'done' }, { key: 'whisper-model', status: 'error', error: 'HF answered 500' }] };
  assert.deepEqual(failedRow(job), { row: 'sttModel', step: job.steps[1] });
  assert.equal(failedRow({ status: 'cancelled', steps: [] }), null);
});

test('the first run sets up what suits this computer, or what was picked', () => {
  assert.deepEqual(firstRunPicks({ status: fresh, catalog, language: 'en-US' }), {
    stt: { value: 'catalog:base', english: true },
    tts: { value: 'catalog:en_US-lessac-medium' },
  });
  assert.deepEqual(firstRunOptions({ status: fresh, catalog, language: 'en-US' }), {
    listen: true, speak: true, whisper: 'base', english: true, voice: 'en_US-lessac-medium', language: 'en-US',
  });
  const picked = firstRunOptions({ status: fresh, catalog, language: 'de-DE', picks: { stt: { value: 'catalog:small', english: false } } });
  assert.deepEqual([picked.whisper, picked.english, picked.voice], ['small', false, 'de_DE-thorsten-medium']);

  // Off, or waiting for a service's key: that group isn't downloaded.
  const offListening = firstRunOptions({ status: { ...fresh, stt: { provider: 'off', ready: false } }, catalog });
  assert.deepEqual([offListening.listen, offListening.speak, offListening.whisper], [false, true, undefined]);
  assert.equal(firstRunOptions({ status: fresh, catalog, drafts: { stt: { provider: 'openai' }, tts: { provider: 'openai' } } }), null);

  // A file of its own already in use: only its engine is missing, which the Engine row installs.
  const own = { ...fresh, stt: { ...fresh.stt, model: { path: '/data/ggml-medium.bin' } } };
  assert.equal(firstRunOptions({ status: own, catalog }).listen, false);
});

test('a part whose engine cannot be downloaded is left out, so the other still sets up', () => {
  const options = firstRunOptions({ status: fresh, catalog, language: 'en-US' });
  const steps = [
    { key: 'whisper-engine', done: false, bytes: null, error: 'No prebuilt Whisper (Speech-to-Text) download is available for linux-x64.', unavailable: true },
    { key: 'whisper-model', done: false, bytes: 59_700_000 },
    { key: 'piper-engine', done: false, bytes: 62_914_560, estimated: true },
    { key: 'voice', done: false, bytes: 63_200_000 },
    { key: 'voice-config', done: false, bytes: 5_000, small: true },
  ];
  const plan = { steps, totalBytes: 186_000_000, estimated: true };

  const action = firstRunAction(options, plan);
  assert.deepEqual(action.options, {
    listen: false, speak: true, whisper: undefined, english: undefined, voice: 'en_US-lessac-medium', language: 'en-US',
  });
  assert.equal(action.totalBytes, 62_914_560 + 63_200_000 + 5_000);
  assert.equal(action.estimated, true);
  assert.equal(action.part, 'speaking');
  assert.deepEqual(action.leftOut, [{ kind: 'stt', unavailable: true }]);
  assert.equal(leftOutText(action.leftOut[0]), "Listening isn't included: it needs whisper.cpp installed on this computer first.");

  // Nothing wrong: the whole plan, as it is.
  const whole = firstRunAction(options, { steps: steps.map(({ error, unavailable, ...step }) => step), totalBytes: 186_000_000, estimated: true });
  assert.deepEqual([whole.options, whole.totalBytes, whole.part, whole.leftOut], [options, 186_000_000, null, []]);
  // Before the plan is in, the options as they are.
  assert.deepEqual(firstRunAction(options, null).options, options);
  assert.equal(firstRunAction(null, plan), null);

  // Only listening was to be set up: nothing is left to download.
  const listenOnly = firstRunAction({ ...options, speak: false, voice: undefined }, plan);
  assert.equal(listenOnly.options, null);
  assert.equal(leftOutText(listenOnly.leftOut[0], { alone: true }), 'Listening needs whisper.cpp installed on this computer first.');

  // A check that failed (GitHub said no) may work later: it says so instead.
  const checkFailed = firstRunAction(options, { ...plan, steps: [{ ...steps[0], error: 'GitHub releases API returned 403', unavailable: false }, ...steps.slice(1)] });
  assert.deepEqual(checkFailed.leftOut, [{ kind: 'stt', unavailable: false }]);
  assert.equal(leftOutText(checkFailed.leftOut[0]), "Listening isn't included until its engine can be checked.");
  // A step already done doesn't count against its part.
  assert.equal(firstRunAction(options, { ...plan, steps: [{ ...steps[0], done: true }, ...steps.slice(1)] }).leftOut.length, 0);
});

test('picks read as their rows: name, size, and whether the file is here', () => {
  assert.deepEqual(pickedWhisper(catalog, library, { value: 'catalog:base', english: true }), {
    name: 'Base (English)', recommended: true, bytes: 59_700_000, path: '/m/audio/whisper/ggml-base.en-q5_1.bin',
  });
  assert.equal(pickedWhisper(catalog, library, { value: 'catalog:small', english: true }).path, null);
  assert.deepEqual(pickedWhisper(catalog, library, { value: 'file:/data/ggml-medium.bin' }), {
    name: 'ggml-medium.bin', recommended: false, bytes: 1_530_000_000, path: '/data/ggml-medium.bin',
  });
  assert.deepEqual(pickedVoice(catalog, library, { value: 'catalog:en_US-amy-medium' }), {
    id: 'en_US-amy-medium', name: 'Amy', language: 'English (US)', recommended: false, bytes: 63_200_000, path: '/m/audio/tts/en_US-amy-medium.onnx',
  });
  assert.equal(pickedVoice(catalog, library, { value: 'catalog:en_US-lessac-medium' }).path, null);
});

test('what is in use reads with its catalog name and size on disk', () => {
  assert.deepEqual(listeningInUse(ready, catalog, library), { name: 'Base (English)', bytes: 59_700_000, path: '/m/audio/whisper/ggml-base.en-q5_1.bin' });
  assert.deepEqual(voiceInUse(ready, catalog, library), { id: 'en_US-amy-medium', name: 'Amy', language: 'English (US)', bytes: 63_100_000, path: '/m/audio/tts/en_US-amy-medium.onnx' });
  assert.equal(listeningInUse(fresh, catalog, library), null);
  assert.equal(voiceInUse({ tts: { provider: 'openai', voice: { id: 'coral' } } }, catalog, library), null);
  assert.deepEqual(setupNames(catalog, { whisper: 'small', english: true, voice: 'en_US-amy-medium' }), { model: 'Small (English)', voice: 'Amy', language: 'English (US)' });
});

test('Runs on: a service without a key waits for it, anything else happens at once', () => {
  assert.deepEqual(runsOnChange('stt', 'local', { saved: 'local', cloud: catalog.cloud }), { type: 'clear' });
  assert.deepEqual(runsOnChange('stt', 'openai', { saved: 'local', cloud: catalog.cloud }), {
    type: 'draft', draft: { provider: 'openai', model: 'gpt-4o-transcribe' },
  });
  assert.deepEqual(runsOnChange('tts', 'openai', { saved: 'local', cloud: catalog.cloud }), {
    type: 'draft', draft: { provider: 'openai', voice: 'coral' },
  });
  assert.deepEqual(runsOnChange('tts', 'gemini', { saved: 'local', cloud: catalog.cloud }), { type: 'choose', choice: { tts: { provider: 'gemini' } } });
  assert.deepEqual(runsOnChange('stt', 'off', { saved: 'openai', cloud: catalog.cloud }), { type: 'choose', choice: { stt: { provider: 'off' } } });
  assert.deepEqual(draftChoice('stt', { provider: 'openai', model: 'gpt-4o-mini-transcribe' }), { stt: { provider: 'openai', model: 'gpt-4o-mini-transcribe' } });
  assert.deepEqual(draftChoice('tts', { provider: 'openai', voice: 'nova' }), { tts: { provider: 'openai', voice: 'nova' } });
  assert.equal(draftChoice('tts', null), null);
  assert.equal(switchedText('stt', 'openai', catalog.cloud), 'Listening now uses OpenAI');
  assert.equal(switchedText('tts', 'local', catalog.cloud), 'Speaking now runs on this computer');
  assert.equal(switchedText('stt', 'off', catalog.cloud), 'Listening is off');
});

test('hints and blocked downloads', () => {
  assert.equal(groupHint('stt', 'local'), 'Turns what you say into text.');
  assert.equal(groupHint('stt', 'off'), 'The mic button is hidden in chats.');
  assert.equal(groupHint('tts', 'off'), "Answers aren't read aloud.");
  assert.equal(downloadBlockedReason({ offline: true, running: true }), "You're offline");
  assert.equal(downloadBlockedReason({ running: true }), 'One download at a time.');
  assert.equal(downloadBlockedReason({}), null);
});
