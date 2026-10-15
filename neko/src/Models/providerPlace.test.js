import test from 'node:test';
import assert from 'node:assert/strict';

import { providerPlace } from './providerPlace.js';

test('a provider is called cloud only when it is neither on this computer nor the network', () => {
  assert.equal(providerPlace({ provider_id: 'custom', provider_type: 'custom', base_url: 'http://127.0.0.1:37895/v1' }), 'runs on your computer');
  assert.equal(providerPlace({ provider_id: 'custom', base_url: 'http://[::1]:8080/v1' }), 'runs on your computer');
  assert.equal(providerPlace({ provider_id: 'ollama', provider_type: 'local', base_url: 'http://localhost:11434/v1' }), 'runs on your computer');
  assert.equal(providerPlace({ provider_id: 'custom', base_url: 'http://192.168.1.20:8000/v1' }), 'on your network');
  assert.equal(providerPlace({ provider_id: 'custom', base_url: 'https://llm.example.com/v1' }), 'OpenAI-compatible server');
  assert.equal(providerPlace({ provider_id: 'openai', provider_type: 'cloud', base_url: 'https://api.openai.com/v1' }), 'cloud provider');
});
