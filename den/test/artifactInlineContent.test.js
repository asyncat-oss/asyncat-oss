import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  createArtifactTool,
  createMarkdownTool,
  createCsvTool,
  createHtmlPageTool,
} from '../src/agent/tools/artifactTools.js';

// The UI fetches an artifact body by filename from the default workspace, so a
// file an agent wrote into a project's own folder used to 404 in the preview.
// Each artifact tool now returns the body inline; the UI prefers that over
// fetching, so the preview works regardless of which folder it was written to.

function workdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-artifact-${randomUUID()}-`));
  return dir;
}

test('create_artifact returns its content inline', async () => {
  const wd = workdir();
  try {
    const res = await createArtifactTool.execute(
      { title: 'Report', filename: 'report.md', content: '# Report\n\nHello', type: 'markdown' },
      { workingDir: wd },
    );
    assert.equal(res.success, true);
    assert.equal(res.artifact.content, '# Report\n\nHello');
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('create_markdown, create_csv and create_html_page all inline their content', async () => {
  const wd = workdir();
  try {
    const md = await createMarkdownTool.execute({ title: 'Doc', content: 'body' }, { workingDir: wd });
    assert.match(md.artifact.content, /body/);

    const csv = await createCsvTool.execute({ title: 'Data', headers: ['a', 'b'], rows: [[1, 2]] }, { workingDir: wd });
    assert.equal(csv.artifact.content, 'a,b\n1,2\n');

    const html = await createHtmlPageTool.execute({ title: 'Page', content: '<p>hi</p>' }, { workingDir: wd });
    assert.match(html.artifact.content, /<p>hi<\/p>/);
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('oversized artifacts are not inlined (fall back to the download link)', async () => {
  const wd = workdir();
  try {
    const big = 'x'.repeat(600 * 1024);
    const res = await createArtifactTool.execute(
      { title: 'Big', filename: 'big.txt', content: big, type: 'text' },
      { workingDir: wd },
    );
    assert.equal(res.artifact.content, undefined);
    assert.equal(res.artifact.contentTruncated, true);
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});
