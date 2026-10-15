// Reads a unified diff (git's, or a bare one that is only @@ hunks) into
// files with numbered lines, for UnifiedDiffViewer, and says why a file has
// no lines to show. Pure, so it is tested (diffParse.test.js).

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const GIT_HEADER = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/;

function blankFile(path = '') {
  return {
    oldPath: path,
    newPath: path,
    hunks: [],
    additions: 0,
    deletions: 0,
    binary: false,
    created: false,
    removed: false,
    renamed: false,
    oldMode: null,
    newMode: null,
  };
}

/** A path from a ---/+++ line: null for /dev/null, without git's a/ or b/. */
function headerPath(text) {
  const value = text.replace(/\t.*$/, '').replace(/^"(.*)"$/, '$1');
  if (value === '/dev/null') return null;
  return value.replace(/^[ab]\//, '');
}

/**
 * The files in `text`, each { oldPath, newPath, hunks, additions, deletions,
 * binary, created, removed, renamed, oldMode, newMode }; a hunk is
 * { header, lines } and a line { type: 'add' | 'del' | 'ctx', text, oldLine,
 * newLine }. `fallbackPath` names a bare diff that has no file header.
 *
 * Each hunk takes as many lines as its @@ header counts, so a removed line
 * that starts with "--" is still a line, and a file's header lines (index,
 * modes, a binary patch) never land in the file before it.
 */
export function parseUnifiedDiff(text, fallbackPath = '') {
  const files = [];
  let file = null;
  let hunk = null;
  let oldLeft = 0;
  let newLeft = 0;
  let oldLine = 0;
  let newLine = 0;

  const startFile = (path = '') => {
    file = blankFile(path);
    files.push(file);
    hunk = null;
    oldLeft = 0;
    newLeft = 0;
    return file;
  };

  const addLine = (raw) => {
    const mark = raw[0];
    if (mark === '+') {
      hunk.lines.push({ type: 'add', text: raw.slice(1), oldLine: null, newLine: newLine++ });
      file.additions++;
      newLeft--;
    } else if (mark === '-') {
      hunk.lines.push({ type: 'del', text: raw.slice(1), oldLine: oldLine++, newLine: null });
      file.deletions++;
      oldLeft--;
    } else {
      hunk.lines.push({ type: 'ctx', text: raw.slice(1), oldLine: oldLine++, newLine: newLine++ });
      oldLeft--;
      newLeft--;
    }
  };

  for (const raw of String(text || '').split('\n')) {
    if (raw.startsWith('\\')) continue; // "\ No newline at end of file"

    if (hunk && (oldLeft > 0 || newLeft > 0)) {
      if (raw === '' || ' +-'.includes(raw[0])) { addLine(raw); continue; }
      hunk = null; // a cut-off hunk: read the line as a header
    }

    const at = raw.match(HUNK);
    if (at) {
      if (!file) startFile(fallbackPath);
      oldLine = Number(at[1]);
      newLine = Number(at[3]);
      oldLeft = at[2] === undefined ? 1 : Number(at[2]);
      newLeft = at[4] === undefined ? 1 : Number(at[4]);
      hunk = { header: raw, lines: [] };
      file.hunks.push(hunk);
      continue;
    }

    if (raw.startsWith('diff --git ')) {
      startFile();
      const git = raw.match(GIT_HEADER);
      if (git) {
        file.oldPath = git[1];
        file.newPath = git[2];
      } else {
        // Without a/ and b/ (diff.noprefix): the same path twice.
        const rest = raw.slice('diff --git '.length);
        const half = (rest.length - 1) / 2;
        if (Number.isInteger(half) && rest[half] === ' ' && rest.slice(0, half) === rest.slice(half + 1)) {
          file.oldPath = rest.slice(0, half);
          file.newPath = file.oldPath;
        }
      }
      continue;
    }

    if (raw.startsWith('--- ')) {
      // A second file in a diff without "diff --git" lines starts here.
      if (!file || file.hunks.length) startFile();
      const path = headerPath(raw.slice(4));
      if (path === null) file.created = true;
      else file.oldPath = path;
      continue;
    }
    if (raw.startsWith('+++ ') && file) {
      const path = headerPath(raw.slice(4));
      if (path === null) file.removed = true;
      else file.newPath = path;
      continue;
    }

    // Lines past a hunk's count that still look like lines (a hand-made diff
    // that miscounted) stay in it.
    if (hunk && raw && ' +-'.includes(raw[0])) { addLine(raw); continue; }

    if (!file) continue;
    let match;
    if ((match = raw.match(/^new file mode (\d+)/))) { file.created = true; file.newMode = match[1]; }
    else if ((match = raw.match(/^deleted file mode (\d+)/))) { file.removed = true; file.oldMode = match[1]; }
    else if ((match = raw.match(/^old mode (\d+)/))) file.oldMode = match[1];
    else if ((match = raw.match(/^new mode (\d+)/))) file.newMode = match[1];
    else if ((match = raw.match(/^(?:rename|copy) from (.+)$/))) { file.renamed = true; file.oldPath = match[1]; }
    else if ((match = raw.match(/^(?:rename|copy) to (.+)$/))) { file.renamed = true; file.newPath = match[1]; }
    else if (raw === 'GIT binary patch' || /^Binary files .* differ$/.test(raw)) file.binary = true;
  }

  return files;
}

/** The path to show for a file: "old → new" when it moved. */
export function diffFilePath(file, fallbackPath = '') {
  const from = file?.oldPath || '';
  const to = file?.newPath || '';
  if (file?.renamed && from && to && from !== to) return `${from} → ${to}`;
  return to || from || fallbackPath || 'Untitled';
}

/** Why a file has no lines to show, in a few words. */
export function emptyDiffNote(file = {}) {
  if (file.binary) return 'Binary file, no text to compare.';
  if (file.oldMode && file.newMode && file.oldMode !== file.newMode) {
    if (file.newMode.endsWith('755') && file.oldMode.endsWith('644')) return 'Only the file mode changed: it can run as a program now.';
    if (file.newMode.endsWith('644') && file.oldMode.endsWith('755')) return 'Only the file mode changed: it no longer runs as a program.';
    return `Only the file mode changed (${file.oldMode} → ${file.newMode}).`;
  }
  if (file.renamed) return 'Moved, with no other changes.';
  if (file.created) return 'New empty file.';
  if (file.removed) return 'Deleted an empty file.';
  return 'No text changes.';
}
