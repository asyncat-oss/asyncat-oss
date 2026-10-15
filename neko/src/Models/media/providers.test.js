import test from 'node:test';
import assert from 'node:assert/strict';
import { billedBy, draftText, keyEnding, keyUrl, listeningModelName, providerLabel, runsOnOptions, sharedKeyNote } from './providers.js';

const voiceCloud = {
  openai: { title: 'OpenAI', hasKey: true, stt: {}, tts: {} },
  elevenlabs: { title: 'ElevenLabs', hasKey: false, stt: {}, tts: {} },
  gemini: { title: 'Gemini', hasKey: false, stt: null, tts: {} },
  fal: { title: 'fal', hasKey: false, stt: {}, tts: {} },
};

test('listening offers the services that can listen, then Off', () => {
  const options = runsOnOptions('stt', voiceCloud);
  assert.deepEqual(options.map((option) => option.value ?? '—'), ['local', 'openai', 'elevenlabs', 'fal', '—', 'off']);
  assert.equal(options[0].description, 'Free and private.');
  assert.equal(options[1].hint, 'Key saved');
  assert.equal(options[2].hint, 'Needs a key');
  assert.equal(options[1].group, 'Services');
  assert.equal(options.at(-1).description, 'The mic button is hidden in chats.');
});

test('speaking adds Gemini; a computer that can’t run the engine says why', () => {
  const options = runsOnOptions('tts', voiceCloud, { unsupportedReason: 'Piper has no build for this processor.' });
  assert.deepEqual(options.filter((option) => option.group).map((option) => option.value), ['openai', 'elevenlabs', 'gemini', 'fal']);
  assert.equal(options[0].disabled, true);
  assert.equal(options[0].description, 'Piper has no build for this processor.');
  assert.equal(options.at(-1).description, "Answers aren't read aloud.");
});

test('images offer ComfyUI and no Off', () => {
  const cloud = {
    openai: { title: 'OpenAI', hasKey: true, edits: true },
    gemini: { title: 'Gemini', hasKey: false, edits: true },
    stability: { title: 'Stability AI', hasKey: false, edits: false },
    fal: { title: 'fal', hasKey: true, edits: false },
  };
  const options = runsOnOptions('image', cloud);
  assert.deepEqual(options.map((option) => option.value), ['local', 'comfyui', 'openai', 'gemini', 'stability', 'fal']);
  assert.equal(options[0].description, 'Uses your graphics card.');
  assert.equal(options[1].description, 'One you run yourself.');
  assert.equal(options[2].description, undefined);
  assert.equal(options[4].description, "Makes new images; can't change them.");
});

test('keys, names and bills in plain words', () => {
  assert.equal(keyEnding('****4f2a'), 'Key ending 4f2a');
  assert.equal(keyEnding('****'), 'Key saved');
  assert.equal(keyEnding(''), 'Key saved');
  assert.equal(keyUrl('openai'), 'https://platform.openai.com/api-keys');
  assert.equal(keyUrl('nobody'), null);
  assert.equal(billedBy('stability'), 'Billed by Stability AI');
  assert.equal(sharedKeyNote('OPENAI_API_KEY', 'voice'), 'Also used for images');
  assert.equal(sharedKeyNote('GEMINI_API_KEY', 'images'), 'Also used for voice');
  assert.equal(sharedKeyNote('ELEVENLABS_API_KEY', 'voice'), null);
  assert.equal(sharedKeyNote('STABILITY_API_KEY', 'images'), null);
  assert.equal(listeningModelName('gpt-4o-transcribe'), 'GPT-4o Transcribe');
  assert.equal(listeningModelName('gpt-4o-mini-transcribe'), 'GPT-4o Mini Transcribe');
  assert.equal(listeningModelName('gpt-transcribe'), 'GPT Transcribe');
  assert.equal(listeningModelName('scribe_v2'), 'Scribe v2');
  assert.equal(listeningModelName('whisper'), 'Whisper');
  assert.equal(providerLabel('local'), 'On this computer');
  assert.equal(providerLabel('elevenlabs', voiceCloud), 'ElevenLabs');
  assert.equal(providerLabel('off'), 'Off');
});

test('a draft footer says what the change waits for, and what still runs only when something does', () => {
  const cloud = { openai: { title: 'OpenAI', hasKey: false }, elevenlabs: { title: 'ElevenLabs', hasKey: true } };
  assert.equal(draftText({ draft: 'openai', current: 'local', currentWorks: false, cloud }), 'Not in use until the key is saved.');
  assert.equal(draftText({ draft: 'comfyui', current: 'local', currentWorks: false, cloud }), 'Not in use until ComfyUI answers.');
  assert.equal(draftText({ draft: 'openai', current: 'local', currentWorks: true, cloud }), 'Not in use until the key is saved. Still runs on this computer.');
  assert.equal(draftText({ draft: 'openai', current: 'off', currentWorks: true, cloud }), 'Not in use until the key is saved. Still off.');
  assert.equal(draftText({ draft: 'openai', current: 'elevenlabs', currentWorks: true, cloud }), 'Not in use until the key is saved. Still uses ElevenLabs.');
});
