import test from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_CHOICES } from '../Settings/sandboxText.js';
import {
  CHAT_MODE_CHOICES, FIT_TEXT, NETWORK_DESCRIPTIONS, SETUP_STEPS, doneText, downloadBytes, downloadLabel,
  hardwareText, isLandingPath, laterJob, localSetupState, nameToPrefill, networkPendingNote, sandboxSentence,
  shouldOpenSetup, stepIndex,
} from './setupFlow.js';

const GB = 1024 ** 3;

test('five steps, and ?step= picks one by name', () => {
  assert.deepEqual(SETUP_STEPS.map((step) => step.id), ['welcome', 'model', 'chats', 'safety', 'done']);
  assert.equal(stepIndex('safety'), 3);
  assert.equal(stepIndex(null), 0);
  assert.equal(stepIndex('nonsense'), 0);
});

test('the setup opens on a fresh start only, and never over a link to another page', () => {
  assert.equal(shouldOpenSetup({ show: true }, '/home'), true);
  assert.equal(shouldOpenSetup({ show: true }, '/'), true);
  assert.equal(shouldOpenSetup({ show: true }, '/home/'), true);
  assert.equal(shouldOpenSetup({ show: true }, '/settings/privacy'), false);
  assert.equal(shouldOpenSetup({ show: true }, '/conversations/abc'), false);
  assert.equal(shouldOpenSetup({ show: false }, '/home'), false);
  assert.equal(shouldOpenSetup(null, '/home'), false);
  assert.equal(isLandingPath(''), true);
  assert.equal(isLandingPath('/welcome'), false);
});

test("the name field starts with the profile's name, not the placeholder a new profile gets", () => {
  assert.equal(nameToPrefill('User'), '');
  assert.equal(nameToPrefill(' user '), '');
  assert.equal(nameToPrefill(''), '');
  assert.equal(nameToPrefill(undefined), '');
  assert.equal(nameToPrefill('  Sam Rivera '), 'Sam Rivera');
});

test('this computer in one line', () => {
  assert.equal(
    hardwareText({ ramBytes: 16 * GB, gpu: { vendor: 'NVIDIA', name: 'NVIDIA GeForce RTX 4050 Laptop GPU', vramGb: 6 } }),
    '16 GB memory · NVIDIA GeForce RTX 4050 Laptop GPU (6 GB)',
  );
  assert.equal(hardwareText({ ramBytes: 8 * GB, gpu: null }), '8 GB memory');
  assert.equal(hardwareText({ ramBytes: 16_339_509_248, gpu: null }), '16 GB memory', 'a "16 GB" laptop reports 15.2');
  assert.equal(hardwareText({ ramBytes: 7.6 * GB, gpu: null }), '8 GB memory');
  assert.equal(hardwareText({ ramBytes: 32 * GB, gpu: { vendor: 'Apple', name: 'Apple Silicon / Metal', vramGb: null } }), '32 GB memory · Apple silicon');
  assert.equal(hardwareText({ ramBytes: 16 * GB, gpu: { vendor: 'AMD', name: 'AMD GPU with ROCm detected', vramGb: null } }), '16 GB memory · AMD graphics card');
  assert.equal(hardwareText({ ramBytes: 16 * GB, gpu: { vendor: 'Intel', name: 'Iris Xe', vramGb: null } }), '16 GB memory · Intel Iris Xe');
  assert.equal(hardwareText(null), '');
});

test('every fit has a plain sentence', () => {
  for (const fit of ['gpu', 'cpu', 'tight', 'too_big']) assert.match(FIT_TEXT[fit], /\.$/, fit);
});

test('the download button says how much it fetches: the model unless it is here, and the engine unless installed', () => {
  const plan = {
    engine: { installed: false, bytes: 31_000_000 },
    models: [
      { id: 'big', bytes: 2_500_000_000, installed: false },
      { id: 'small', bytes: 1_110_000_000, installed: true },
    ],
  };
  assert.equal(downloadBytes(plan, 'big'), 2_531_000_000);
  assert.equal(downloadBytes(plan, 'small'), 31_000_000);
  assert.equal(downloadBytes({ ...plan, engine: { installed: true } }, 'small'), 0);
  assert.equal(downloadBytes(plan, 'missing'), 0);
  assert.equal(downloadLabel(2_531_000_000), 'Download 2.5 GB');
  assert.equal(downloadLabel(31_000_000), 'Download 31 MB');
  assert.equal(downloadLabel(0), 'Use this model');
});

test('where a local model setup is', () => {
  assert.equal(localSetupState(null, {}), 'idle');
  assert.equal(localSetupState({ status: 'cancelled' }, {}), 'idle');
  assert.equal(localSetupState({ status: 'running' }, {}), 'running');
  assert.equal(localSetupState({ status: 'error', error: 'HTTP 404' }, {}), 'error');
  assert.equal(localSetupState({ status: 'complete', result: { loaded: false, error: 'llama-server not found' } }, {}), 'error');
  assert.equal(localSetupState({ status: 'complete', result: { loaded: false, reason: 'in_use' } }, {}), 'kept');
  assert.equal(localSetupState({ status: 'complete', result: { loaded: true } }, { isLoadingModel: true }), 'loading');
  assert.equal(localSetupState({ status: 'complete', result: { loaded: true } }, { status: 'error' }), 'error');
  assert.equal(localSetupState({ status: 'complete', result: { loaded: true } }, { isReady: true, status: 'ready', isBuiltin: true }), 'ready');
  assert.equal(localSetupState({ status: 'complete', result: { loaded: true } }, { isReady: true, status: 'ready', isBuiltin: false }), 'kept', 'a provider connected since');
});

test('the last step says whether chats can start now', () => {
  assert.match(doneText({ brain: { isReady: true }, localState: 'idle' }), /^Ask anything/);
  assert.match(doneText({ brain: {}, localState: 'running' }), /still downloading/);
  // An online model answers while a local one downloads: chats can start now.
  assert.equal(
    doneText({ brain: { isReady: true, isBuiltin: false }, localState: 'running', localName: 'Qwen3 4B Instruct' }),
    "Ask anything. Qwen3 4B Instruct keeps downloading; switch to it in Models when it's done.",
  );
  assert.match(doneText({ brain: { isReady: true }, localState: 'running' }), /^Ask anything\. Your local model keeps downloading/);
  assert.match(doneText({ brain: { isLoadingModel: true }, localState: 'loading' }), /^Ask anything/);
  assert.match(doneText({ brain: { isReady: false }, localState: 'idle' }), /Choose a model in Models/);
});

test('where new chats start, and the network choices, in one sentence each', () => {
  assert.deepEqual(CHAT_MODE_CHOICES.map((choice) => choice.value), ['plan', 'action', 'last']);
  for (const choice of CHAT_MODE_CHOICES) assert.match(choice.description, /^[A-Z].*\.$/, choice.value);
  assert.deepEqual(Object.keys(NETWORK_DESCRIPTIONS), NETWORK_CHOICES.map((choice) => choice.value));
  assert.match(NETWORK_DESCRIPTIONS.open, /read your chats/, 'Open says what makes the other choices worth picking');
  assert.equal(networkPendingNote({ state: 'unavailable', reason: 'x' }), 'This applies once the sandbox can start.');
  for (const state of ['on', 'off', 'unsupported']) assert.equal(networkPendingNote({ state }), null, state);
  assert.equal(networkPendingNote(null), null);
});

test('the sandbox switch says what it does now', () => {
  assert.equal(sandboxSentence(null), 'Checking…');
  assert.match(sandboxSentence({ state: 'on' }), /only in your project/);
  assert.match(sandboxSentence({ state: 'off' }), /^Off: /);
  assert.match(sandboxSentence({ state: 'unsupported' }), /Windows/);
  assert.equal(
    sandboxSentence({ state: 'unavailable', reason: 'AppArmor stops bwrap from running.' }),
    "It can't start here: AppArmor stops bwrap from running. Asyncat asks before every command instead.",
  );
});

test('the download to show: a running one, else the one started last, never a late reading', () => {
  const old = { id: 'a', status: 'cancelled', startedAt: '2026-10-14T10:00:00.000Z' };
  const running = { id: 'b', status: 'running', startedAt: '2026-10-14T11:00:00.000Z' };
  assert.equal(laterJob(null, null), null);
  assert.equal(laterJob(null, running), running, 'after a reload, or the setup run again');
  assert.equal(laterJob(old, null), old);
  assert.equal(laterJob(old, running), running, 'one started in another window replaces a cancelled one');
  assert.equal(laterJob(running, old), running);
  const finished = { ...running, status: 'complete' };
  assert.equal(laterJob(running, finished), finished);
  assert.equal(laterJob(finished, running), finished, 'a poll answered after the download finished');
  const newer = { id: 'c', status: 'error', startedAt: '2026-10-14T12:00:00.000Z' };
  assert.equal(laterJob(old, newer), newer);
  assert.equal(laterJob(newer, old), newer);
});
