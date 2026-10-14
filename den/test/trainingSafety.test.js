// Training runs outside the command sandbox, with GPU access, so it must not
// become a way round it: no saved keys in its environment (only the Hugging
// Face token), no model's own Python code, and no model folder the agent's
// commands could have written in the project.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-training-safety-')));
process.on('exit', () => fs.rmSync(scratch, { recursive: true, force: true }));

process.env.ASYNCAT_HOME = path.join(scratch, 'home');
process.env.OPENAI_API_KEY = 'sk-saved-key';
process.env.HF_TOKEN = 'hf_saved_token';
const envDump = path.join(scratch, 'training-env.txt');
const venvBin = path.join(process.env.ASYNCAT_HOME, 'training', 'python', 'bin');
fs.mkdirSync(venvBin, { recursive: true });
fs.writeFileSync(path.join(venvBin, 'python'), `#!/bin/sh\nenv > '${envDump}'\n`, { mode: 0o755 });

const { default: db } = await import('../src/db/client.js');
const { startTrainingJob } = await import('../src/ai/controllers/ai/trainingJobManager.js');
const { projectModelFolder, startFinetuneJobTool } = await import('../src/agent/tools/trainingTools.js');

test('training gets no saved keys, only the Hugging Face token', { skip: process.platform === 'win32' && 'needs a shell script' }, async () => {
  const userId = randomUUID();
  db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
  const dataset = path.join(scratch, 'data.jsonl');
  fs.writeFileSync(dataset, '{"text":"hello"}\n');
  startTrainingJob({ userId, name: 'env check', baseModel: 'org/model', datasetPath: dataset });
  for (let waited = 0; waited < 5000 && !fs.existsSync(envDump); waited += 50) await new Promise((resolve) => setTimeout(resolve, 50));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const env = fs.readFileSync(envDump, 'utf8');
  assert.match(env, /^HF_TOKEN=hf_saved_token$/m, 'gated models still download');
  assert.doesNotMatch(env, /sk-saved-key/);
});

test("the training script never runs a model's own code", () => {
  const script = fs.readFileSync(path.join(here, '..', 'src', 'ai', 'controllers', 'ai', 'scripts', 'train_lora.py'), 'utf8');
  assert.doesNotMatch(script, /trust_remote_code\s*=\s*True/);
});

test('start_finetune_job refuses a model folder in the project', async () => {
  const project = path.join(scratch, 'project');
  const model = path.join(project, 'models', 'tiny');
  fs.mkdirSync(model, { recursive: true });
  const outside = path.join(scratch, 'outside-model');
  fs.mkdirSync(outside);
  fs.symlinkSync(model, path.join(scratch, 'link-to-project-model'));

  assert.equal(projectModelFolder(model, project), model);
  assert.equal(projectModelFolder(path.join(scratch, 'link-to-project-model'), project), model, 'through a link');
  assert.equal(projectModelFolder(outside, project), null);
  assert.equal(projectModelFolder('unsloth/Qwen3-1.7B', project), null, 'a Hugging Face id');

  const res = await startFinetuneJobTool.execute({ name: 'x', base_model: model, dataset_path: path.join(scratch, 'data.jsonl') }, { workingDir: project, workspaceRoot: project });
  assert.equal(res.success, false);
  assert.match(res.error, /folder in the project/);
});
