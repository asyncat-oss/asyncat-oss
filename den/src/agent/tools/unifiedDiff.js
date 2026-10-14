// den/src/agent/tools/unifiedDiff.js
// ─── Reading and applying unified diffs ──────────────────────────────────────
// Pure functions for apply_patch: parse a unified diff (as `git diff` or
// `diff -u` print it) into files and hunks, and apply a file's hunks to its
// text. Models often get the line numbers in "@@ -12,5 +12,6 @@" wrong, so a
// hunk is placed by its context lines (nearest to the stated line), and the
// counts only settle whether bare blank lines at the end of a hunk belong to
// it or just separate it from what follows.

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function diffPath(raw) {
  // "a/src/x.js\t2026-10-14 08:00:00" → "a/src/x.js"; quoted names unquoted.
  let value = String(raw || '').replace(/\t.*$/, '').trim();
  if (/^".*"$/.test(value)) value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return value === '/dev/null' ? null : value;
}

/**
 * Split a unified diff into files: [{ oldPath, newPath, git, hunks }], where
 * a path is null for /dev/null (a new or deleted file) and each hunk is
 * { oldStart, oldCount, newStart, newCount,
 *   lines: [{ type: ' ' | '-' | '+', text }], oldNoNewline, newNoNewline,
 *   looseTail? } (looseTail: how many of the last lines were bare blank
 *   lines taken as empty context, which applyHunks may drop).
 */
export function parseUnifiedDiff(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const files = [];
  let file = null;
  let hunk = null;
  let last = null; // type of the last hunk line, for "\ No newline at end of file"
  let blanks = 0; // bare blank lines in a hunk, not yet known to belong to it

  // Some tools drop the space of an empty context line, and models leave
  // blank lines between files and after the diff. Bare blank lines followed
  // by more of the hunk are empty context lines; at the end of a hunk they
  // count only as far as the @@ counts still want lines.
  const settleBlanks = (hunkEnds) => {
    if (hunk && blanks) {
      let keep = blanks;
      if (hunkEnds) {
        const oldSeen = hunk.lines.filter((l) => l.type !== '+').length;
        const newSeen = hunk.lines.filter((l) => l.type !== '-').length;
        keep = Math.max(0, Math.min(blanks, hunk.oldCount - oldSeen, hunk.newCount - newSeen));
        if (keep) hunk.looseTail = keep;
      }
      for (let k = 0; k < keep; k++) hunk.lines.push({ type: ' ', text: '' });
      if (keep) last = ' ';
    }
    blanks = 0;
  };

  const startFile = (props) => {
    settleBlanks(true);
    file = { oldPath: undefined, newPath: undefined, git: false, hunks: [], ...props };
    files.push(file);
    hunk = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const git = line.match(/^diff --git ("?a\/.+?"?) ("?b\/.+"?)$/);
    if (git) {
      startFile({ git: true, oldPath: diffPath(git[1]), newPath: diffPath(git[2]) });
      continue;
    }
    if (line.startsWith('--- ') && lines[i + 1]?.startsWith('+++ ')) {
      settleBlanks(true);
      hunk = null;
      const oldPath = diffPath(line.slice(4));
      const newPath = diffPath(lines[i + 1].slice(4));
      // A "diff --git" header names the file; ---/+++ say whether it is new or gone.
      if (!file || file.hunks.length || file.headerSeen) startFile({});
      file.oldPath = oldPath;
      file.newPath = newPath;
      file.headerSeen = true;
      i += 1;
      continue;
    }
    const header = line.match(HUNK_RE);
    if (header) {
      if (!file) throw new Error('The patch has a hunk (@@ … @@) before any file header (--- a/… and +++ b/…).');
      settleBlanks(true);
      // "@@ -3 +3 @@" leaves the counts out: one line each.
      const count = (value) => (value === undefined ? 1 : Number(value));
      hunk = {
        oldStart: Number(header[1]), oldCount: count(header[2]),
        newStart: Number(header[3]), newCount: count(header[4]),
        lines: [], oldNoNewline: false, newNoNewline: false,
      };
      file.hunks.push(hunk);
      last = null;
      continue;
    }
    if (!hunk) continue; // "index …", "new file mode …", prose around the diff
    if (line === '') {
      blanks += 1;
      continue;
    }
    if (line.startsWith('\\')) {
      settleBlanks(false);
      if (last === '-') hunk.oldNoNewline = true;
      else if (last === '+') hunk.newNoNewline = true;
      else if (last === ' ') { hunk.oldNoNewline = true; hunk.newNoNewline = true; }
      continue;
    }
    const type = line[0];
    if (type === ' ' || type === '-' || type === '+') {
      settleBlanks(false);
      hunk.lines.push({ type, text: line.slice(1) });
      last = type;
    } else {
      settleBlanks(true);
      hunk = null; // text after the hunk
    }
  }
  settleBlanks(true);

  const parsed = files.filter((f) => f.hunks.length || f.oldPath !== f.newPath);
  for (const f of parsed) delete f.headerSeen;
  return parsed;
}

/** Drop the first n components of a path ("a/src/x.js", 1 → "src/x.js"). */
export function stripComponents(filePath, n) {
  if (!filePath || !n) return filePath;
  const parts = filePath.split('/');
  return parts.length > n ? parts.slice(n).join('/') : parts[parts.length - 1];
}

function findBlock(lines, block, from, near, loose) {
  const same = loose ? (a, b) => a.trimEnd() === b.trimEnd() : (a, b) => a === b;
  const fits = (at) => block.every((text, k) => at + k < lines.length && same(lines[at + k], text));
  const last = lines.length - block.length;
  // Look outward from where the hunk says it starts, never before `from`.
  const start = Math.max(from, Math.min(near, last));
  for (let distance = 0; start - distance >= from || start + distance <= last; distance++) {
    if (start + distance <= last && fits(start + distance)) return start + distance;
    if (distance && start - distance >= from && fits(start - distance)) return start - distance;
  }
  return -1;
}

/**
 * Apply hunks to a file's text. Returns the new text; throws an Error that
 * says which hunk did not fit and what the file has there.
 */
export function applyHunks(content, hunks, { label = 'the file' } = {}) {
  const crlf = /\r\n/.test(content);
  const text = crlf ? content.replace(/\r\n/g, '\n') : content;
  // A new file ends with a newline unless the patch says otherwise.
  let endsWithNewline = text === '' || text.endsWith('\n');
  const lines = text === '' ? [] : (endsWithNewline ? text.slice(0, -1) : text).split('\n');
  let from = 0;
  let shift = 0;

  const place = (hunkLines, hunk) => {
    const before = hunkLines.filter((l) => l.type !== '+').map((l) => l.text);
    const after = hunkLines.filter((l) => l.type !== '-').map((l) => l.text);
    if (!before.length) {
      // Pure addition: "@@ -0,0" is the top of the file, "@@ -n,0" after line n.
      return { at: Math.max(from, Math.min(lines.length, hunk.oldStart + shift)), before, after };
    }
    const near = Math.max(0, hunk.oldStart - 1 + shift);
    let at = findBlock(lines, before, from, near, false);
    if (at < 0) at = findBlock(lines, before, from, near, true);
    return { at, before, after, near };
  };

  hunks.forEach((hunk, index) => {
    let placed = place(hunk.lines, hunk);
    // Bare blank lines that end a hunk were read as empty context because
    // its counts asked for them; counts can be wrong, so try without them.
    if (placed.at < 0 && hunk.looseTail) {
      const loose = place(hunk.lines.slice(0, -hunk.looseTail), hunk);
      if (loose.at >= 0) placed = loose;
    }
    const { at, before, after, near } = placed;
    if (at < 0) {
      const shown = lines.slice(Math.max(0, near - 2), near + Math.min(before.length, 6) + 2).join('\n');
      throw new Error(`Hunk ${index + 1} for ${label} does not match the file (it may have changed: read it again). Around line ${hunk.oldStart} the file has:\n${shown}`);
    }
    lines.splice(at, before.length, ...after);
    from = at + after.length;
    shift += after.length - before.length;
    if (hunk.newNoNewline) endsWithNewline = false;
    else if (hunk.oldNoNewline) endsWithNewline = true;
  });

  let result = lines.join('\n');
  if (lines.length && endsWithNewline) result += '\n';
  return crlf ? result.replace(/\n/g, '\r\n') : result;
}
