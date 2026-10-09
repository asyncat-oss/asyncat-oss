import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const suffix = `${process.pid}-${Date.now()}-${randomUUID()}`;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-input-hardening-${suffix}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');

const { default: express } = await import('express');
const { findReferencesTool, codeSearchTool } = await import('../src/agent/tools/codeSearchTools.js');
const { getGitCommit } = await import('../src/agent/gitService.js');
const { default: attachmentRoutes } = await import('../src/notes/routes/attachmentRoutes.js');

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const projectDir = path.join(scratch, 'project');
fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
fs.writeFileSync(path.join(projectDir, 'package.json'), '{}\n');
fs.writeFileSync(path.join(projectDir, 'src', 'math.js'), 'export function addNumbers(a, b) { return a + b; }\n');
fs.writeFileSync(path.join(projectDir, 'src', 'main.js'), "import { addNumbers } from './math.js';\naddNumbers(1, 2);\n");

const marker = path.join(scratch, 'injected');

test('find_references treats symbol and language as data, not shell syntax', async () => {
  await findReferencesTool.execute(
    { symbol: 'x', language: `js; touch ${marker};` },
    { workingDir: projectDir },
  );
  await findReferencesTool.execute(
    { symbol: `$(touch ${marker})`, language: '' },
    { workingDir: projectDir },
  );
  assert.equal(fs.existsSync(marker), false);
});

test('find_references reports matches relative to the project root', async () => {
  const result = await findReferencesTool.execute({ symbol: 'addNumbers' }, { workingDir: projectDir });
  assert.equal(result.success, true);
  assert.deepEqual(
    result.results.map((r) => r.file.split(path.sep).join('/')).sort(),
    ['src/main.js', 'src/main.js', 'src/math.js'],
  );
});

test('code_search fallbacks do not run shell syntax from the symbol or project path', async () => {
  const pathMarker = path.join(scratch, 'injected-by-path');
  const trickyDir = path.join(scratch, `proj'$(touch ${pathMarker})'`);
  fs.mkdirSync(trickyDir, { recursive: true });
  fs.writeFileSync(path.join(trickyDir, 'package.json'), '{}\n');

  await codeSearchTool.execute({ symbol: 'noSuchSymbolAnywhere' }, { workingDir: trickyDir });
  await codeSearchTool.execute({ symbol: `'; touch ${pathMarker}; '` }, { workingDir: projectDir });
  assert.equal(fs.existsSync(pathMarker), false);
});

test('getGitCommit rejects option-like hashes', () => {
  execFileSync('git', ['init', '-q'], { cwd: projectDir });
  const output = path.join(scratch, 'git-output');
  const result = getGitCommit(projectDir, `--output=${output}`);
  assert.equal(result.success, false);
  assert.equal(fs.existsSync(output), false);
});

test('attachment routes reject file names with path components', async () => {
  const app = express();
  app.use(attachmentRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const statusFor = (port, name) => new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/notes/some-note/${name}`, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
  try {
    const { port } = server.address();
    for (const name of ['..%2F..%2F..%2Fetc%2Fpasswd', '%2E%2E%2Fsecret.txt', 'nested%2Ffile.txt']) {
      assert.equal(await statusFor(port, name), 400, name);
    }
    assert.notEqual(await statusFor(port, 'photo.png'), 400);
  } finally {
    server.close();
  }
});
