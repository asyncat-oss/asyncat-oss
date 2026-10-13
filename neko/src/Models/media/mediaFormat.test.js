import test from 'node:test';
import assert from 'node:assert/strict';
import { gpuLine, jobPercent, stepProgressText, stepSizeText, totalText, voicesByLanguage } from './mediaFormat.js';

test('sizes and step states read plainly', () => {
  assert.equal(totalText(0), 'nothing to download');
  assert.equal(totalText(62_600_000, { estimated: true }), 'about 59.7 MB');
  assert.equal(stepSizeText({ done: true, bytes: 5 }), 'Already on this computer');
  assert.equal(stepSizeText({ bytes: 1_760_000_000 }), '1.64 GB');
  assert.equal(stepProgressText({ status: 'running', downloaded: 1_048_576, total: 10_485_760 }), '1.00 MB of 10.0 MB');
  assert.equal(stepProgressText({ status: 'skipped' }), 'Already here');
});

test('overall progress weighs big downloads more', () => {
  const job = { steps: [
    { status: 'done', bytes: 1_000_000 },
    { status: 'running', progress: 50, total: 9_000_000 },
  ] };
  assert.equal(jobPercent(job), 55);
  assert.equal(jobPercent({ steps: [] }), 0);
});

test('voices group by language, the user’s first', () => {
  const voices = [
    { id: 'de', language: 'German', locale: 'de-DE' },
    { id: 'a', language: 'English (US)', locale: 'en-US' },
    { id: 'fr', language: 'French', locale: 'fr-FR' },
  ];
  assert.deepEqual(voicesByLanguage(voices, 'fr-FR').map((group) => group.language), ['French', 'English (US)', 'German']);
  assert.equal(gpuLine({ vendor: 'NVIDIA', name: 'RTX 4050 Laptop', vramGb: 6 }), 'RTX 4050 Laptop · 6 GB');
  assert.equal(gpuLine(null), 'No graphics card found');
});
