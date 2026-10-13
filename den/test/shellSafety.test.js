import test from 'node:test';
import assert from 'node:assert/strict';

import { isReadOnlyShellCommand, splitShellWords } from '../src/agent/shellSafety.js';

// Commands judged read-only run without an approval card, so every one of
// these must be refused: each writes, deletes, runs another program or reads
// outside the working folder.
const MUST_ASK = [
  'find ~ -delete',
  'find . -delete',
  'find . -fprint out.txt',
  'find . -exec rm {} +',
  "awk 'BEGIN{system(\"id\")}'",
  'sort -o notes.txt input.txt',
  'sort -uo notes.txt input.txt',
  'sort --output=notes.txt input.txt',
  'git branch -D main',
  'git branch new-feature',
  'git tag v9',
  'git log --output=report.txt',
  'git diff --output=report.txt',
  'git diff --no-index a.txt b.txt',
  'git remote set-url origin https://example.invalid/x.git',
  'git remote add evil https://example.invalid/x.git',
  'git -c core.pager=less log',
  'git stash',
  'git grep -O vim needle',
  'rg --pre cat needle',
  'uniq input.txt output.txt',
  'tail -f app.log',
  "sed -n '1w copy.txt' file.txt",
  "sed -n '1e id' file.txt",
  'sed -i s/a/b/ file.txt',
  'cat ~/.ssh/id_rsa',
  'cat /etc/passwd',
  'cat ../../secrets.env',
  'grep -r password /etc',
  'grep -f/etc/shadow x',
  'cd /etc && cat passwd',
  'cd .. && ls',
  'ls; rm -rf build',
  'ls && rm -rf build',
  'ls || true',
  'ls & sleep 1',
  'echo $(id)',
  'echo "$HOME"',
  'echo `id`',
  'cat file > copy',
  'cat < file',
  'rm -rf build',
  'npm install',
  'curl https://example.invalid',
  'python3 script.py',
  'date -s 2020-01-01',
  'xargs rm',
];

const READ_ONLY = [
  'ls -la',
  'pwd',
  'cat package.json',
  'head -n 40 src/index.js',
  'tail -n 20 README.md',
  'wc -l src/*.js',
  'grep -rn "useEffect" src',
  'grep -rn "/api/users" src',
  "rg -n '/api/agent' den/src",
  'rg -n --glob "*.jsx" Sidebar neko/src',
  'find . -name "*.test.js"',
  'find src -type f -name "*.md"',
  'git status',
  'git status --short',
  'git log --oneline -10',
  'git diff HEAD~1 -- src',
  'git show HEAD:package.json',
  'git branch',
  'git branch -a',
  'git branch --show-current',
  'git tag -l "v0.8*"',
  'git remote -v',
  'git stash list',
  'cd den && ls',
  'cd den && git log --oneline | head -5',
  'ls src | sort | uniq -c',
  "sed -n '1,40p' src/index.js",
  "sed -n '/export/p' src/index.js",
  'du -sh src',
  'tree -L 2 src',
];

test('commands that write, run programs or leave the folder need approval', () => {
  for (const command of MUST_ASK) {
    assert.equal(isReadOnlyShellCommand(command), false, `must ask first: ${command}`);
  }
});

test('ordinary read-only commands inside the folder still run straight away', () => {
  for (const command of READ_ONLY) {
    assert.equal(isReadOnlyShellCommand(command), true, `should not need approval: ${command}`);
  }
});

test('the word splitter follows sh quoting and refuses expansions', () => {
  assert.deepEqual(splitShellWords(`grep -n "a b" 'c d'`).segments, [['grep', '-n', 'a b', 'c d']]);
  assert.equal(splitShellWords('echo "$(id)"'), null);
  assert.equal(splitShellWords("echo 'unterminated"), null);
});
