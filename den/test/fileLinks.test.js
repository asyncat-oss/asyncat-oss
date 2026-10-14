// den's file tools run outside the command sandbox. A sandboxed command can't
// read ~/.ssh or write in the home folder, but it can leave a link in the
// project pointing there; the file tools must not follow it out.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { realPathOf, safePath } from '../src/agent/tools/shared.js';
import { editFileTool, readFileTool, writeFileTool } from '../src/agent/tools/fileTools.js';

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-file-links-'));
  const project = path.join(root, 'project');
  const outside = path.join(root, 'home');
  fs.mkdirSync(path.join(project, 'src'), { recursive: true });
  fs.mkdirSync(path.join(outside, '.ssh'), { recursive: true });
  fs.writeFileSync(path.join(outside, '.ssh', 'id_ed25519'), 'PRIVATE-KEY-DEMO\n');
  fs.writeFileSync(path.join(outside, '.bashrc'), '# mine\n');
  fs.writeFileSync(path.join(project, 'src', 'app.js'), 'one\n');
  return { root, project, outside };
}

const outcome = (promise) => promise.catch((err) => ({ success: false, error: err.message }));

test('a path is checked where its links lead, also for files not made yet', () => {
  const { root, project, outside } = scratch();
  try {
    fs.symlinkSync(path.join(outside, '.ssh', 'id_ed25519'), path.join(project, 'leak'));
    fs.symlinkSync(path.join(outside, '.ssh'), path.join(project, 'keys'));
    fs.symlinkSync(path.join(outside, 'autostart', 'evil.desktop'), path.join(project, 'dangling'));
    fs.symlinkSync('src', path.join(project, 'inside'));
    fs.symlinkSync('loop-b', path.join(project, 'loop-a'));
    fs.symlinkSync('loop-a', path.join(project, 'loop-b'));

    for (const target of ['leak', 'keys/id_ed25519', 'keys/new-file', 'dangling', 'dangling/x']) {
      assert.throws(() => safePath(target, project), /link to somewhere outside/, target);
    }
    assert.throws(() => safePath('loop-a', project), /too many links/);
    assert.equal(safePath('inside/app.js', project), path.join(project, 'inside', 'app.js'), 'a link inside the project');
    assert.equal(safePath('src/new/deeper.js', project), path.join(project, 'src', 'new', 'deeper.js'), 'a file not made yet');
    assert.throws(() => safePath('../home/.bashrc', project), /outside the working directory/);
    assert.equal(realPathOf(path.join(project, 'dangling')), path.join(fs.realpathSync(outside), 'autostart', 'evil.desktop'));

    // A project reached through a link of its own still works.
    const linkedProject = path.join(root, 'linked-project');
    fs.symlinkSync(project, linkedProject);
    assert.equal(safePath('src/app.js', linkedProject), path.join(linkedProject, 'src', 'app.js'));
    assert.throws(() => safePath('leak', linkedProject), /link to somewhere outside/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("read_file, write_file and edit_file don't follow a link out of the project", async () => {
  const { root, project, outside } = scratch();
  const context = { workingDir: project };
  try {
    fs.symlinkSync(path.join(outside, '.ssh', 'id_ed25519'), path.join(project, 'leak'));
    fs.symlinkSync(path.join(outside, '.bashrc'), path.join(project, 'rc'));
    fs.symlinkSync(path.join(outside, 'new-file'), path.join(project, 'dangling'));

    const read = await outcome(readFileTool.execute({ path: 'leak' }, context));
    assert.equal(read.success, false);
    assert.doesNotMatch(JSON.stringify(read), /PRIVATE-KEY-DEMO/);

    const write = await outcome(writeFileTool.execute({ path: 'rc', content: 'echo planted\n' }, context));
    assert.equal(write.success, false);
    const edit = await outcome(editFileTool.execute({ path: 'rc', old_string: '# mine', new_string: 'echo planted' }, context));
    assert.equal(edit.success, false);
    assert.equal(fs.readFileSync(path.join(outside, '.bashrc'), 'utf8'), '# mine\n');

    const create = await outcome(writeFileTool.execute({ path: 'dangling', content: 'x' }, context));
    assert.equal(create.success, false);
    assert.equal(fs.existsSync(path.join(outside, 'new-file')), false);

    // Files in the project still work.
    const ok = await outcome(readFileTool.execute({ path: 'src/app.js' }, context));
    assert.equal(ok.success, true, ok.error);
    const written = await outcome(writeFileTool.execute({ path: 'src/new.js', content: 'two\n' }, context));
    assert.equal(written.success, true, written.error);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
