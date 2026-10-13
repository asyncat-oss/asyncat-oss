/**
 * Decide whether a shell command can run without asking the user.
 *
 * run_command is a dangerous tool, but asking before every `ls` or `git status`
 * makes the agent unusable, so commands that provably only read files inside
 * the working folder run straight away. "Provably" is the point: the command is
 * parsed into words, every program must be on an allow-list, and each program's
 * options are checked against what that program can do (find -delete, sort -o,
 * git branch -D, rg --pre and awk's system() all write or run other programs).
 * Anything this cannot prove read-only returns false and the user is asked.
 */

// Characters that start an expansion, redirect, subshell or second command.
const UNQUOTED_FORBIDDEN = new Set([';', '<', '>', '`', '$', '(', ')', '{', '}', '\\', '\n', '\r']);

/**
 * Split a command into pipeline segments of words, following sh quoting.
 * Returns null for anything that is not a plain word list joined by `|`
 * (or `&&` after cd): expansions, redirects, subshells, background jobs.
 */
export function splitShellWords(command) {
  const segments = [[]];
  const separators = [];
  let word = null;

  const endWord = () => {
    if (word !== null) segments[segments.length - 1].push(word);
    word = null;
  };

  for (let i = 0; i < command.length;) {
    const ch = command[i];
    if (ch === "'") {
      const end = command.indexOf("'", i + 1);
      if (end === -1) return null;
      word = (word ?? '') + command.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      let text = '';
      let j = i + 1;
      for (; j < command.length && command[j] !== '"'; j++) {
        const c = command[j];
        // Double quotes still expand $VAR, $(...) and `...`.
        if (c === '$' || c === '`') return null;
        if (c === '\\') {
          if (j + 1 >= command.length) return null;
          text += command[j + 1];
          j++;
          continue;
        }
        text += c;
      }
      if (j >= command.length) return null;
      word = (word ?? '') + text;
      i = j + 1;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      endWord();
      i++;
      continue;
    }
    if (ch === '|') {
      if (command[i + 1] === '|') return null;
      endWord();
      separators.push('|');
      segments.push([]);
      i++;
      continue;
    }
    if (ch === '&') {
      if (command[i + 1] !== '&') return null;
      endWord();
      separators.push('&&');
      segments.push([]);
      i += 2;
      continue;
    }
    if (UNQUOTED_FORBIDDEN.has(ch)) return null;
    word = (word ?? '') + ch;
    i++;
  }
  endWord();
  if (segments.some((segment) => segment.length === 0)) return null;
  return { segments, separators };
}

/** True when a word names something outside the working folder. */
export function pointsOutsideWorkingDir(word) {
  const values = [word];
  const eq = word.indexOf('=');
  if (eq !== -1) values.push(word.slice(eq + 1));
  // -f/etc/passwd: a short option with its value attached.
  if (/^-[A-Za-z]./.test(word)) values.push(word.slice(2));
  return values.some((value) => (
    value.startsWith('/')
    || value.startsWith('~')
    || /^[A-Za-z]:[\\/]/.test(value)
    || /(^|\/)\.\.(\/|$)/.test(value)
  ));
}

const SED_PRINT_ADDRESS = String.raw`(?:\d+|\$|\/(?:[^/\\]|\\.)*\/)`;
const SED_PRINT_ONLY = new RegExp(`^(?:${SED_PRINT_ADDRESS}(?:,${SED_PRINT_ADDRESS})?)?p$`);

// Per program: options that write files, run programs or never return
// (deny), options whose next word is a value (valueFlags), and how
// positional words are checked.
const PROGRAMS = {
  pwd: {},
  ls: {},
  cat: {},
  nl: {},
  wc: {},
  stat: {},
  file: {},
  tree: { valueFlags: ['-L', '-P', '-I'], deny: ['-o'] },
  du: {},
  diff: {},
  cmp: {},
  basename: {},
  dirname: {},
  realpath: {},
  which: {},
  uname: {},
  whoami: {},
  echo: { pathless: true },
  date: { deny: ['-s', '--set', '-f', '--file'], pathless: true },
  head: { valueFlags: ['-n', '-c', '--lines', '--bytes'] },
  tail: { valueFlags: ['-n', '-c', '--lines', '--bytes'], deny: ['-f', '-F', '--follow', '--retry'] },
  sort: {
    valueFlags: ['-k', '-t', '-S', '--key', '--field-separator', '--buffer-size'],
    deny: ['-o', '--output', '-T', '--temporary-directory', '--compress-program', '--files0-from'],
  },
  uniq: { valueFlags: ['-f', '-s', '-w'], maxPositionals: 1 },
  cut: { valueFlags: ['-d', '-f', '-c', '-b', '--delimiter', '--fields', '--characters', '--bytes'] },
  tr: { pathless: true },
  grep: {
    pattern: true,
    patternFlags: ['-e', '--regexp'],
    valueFlags: ['-e', '--regexp', '-f', '--file', '-m', '--max-count', '-A', '-B', '-C',
      '--include', '--exclude', '--exclude-dir', '--label', '--color', '--colour'],
  },
  rg: {
    pattern: true,
    patternFlags: ['-e', '--regexp'],
    valueFlags: ['-e', '--regexp', '-f', '--file', '-g', '--glob', '-t', '--type', '-T', '--type-not',
      '-m', '--max-count', '-A', '-B', '-C', '-M', '--max-columns', '--max-depth', '-d', '--color', '--colors',
      '--sort', '--sortr', '-j', '--threads', '--iglob'],
    deny: ['--pre', '--pre-glob', '-z', '--search-zip'],
  },
  find: {
    // find's options are single-dash words, never combined.
    words: true,
    deny: ['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprint0', '-fprintf', '-fls'],
  },
  sed: { sedPrintOnly: true },
};

// git: only these subcommands, with no global options before them.
const GIT_READ_SUBCOMMANDS = new Set([
  'status', 'log', 'show', 'diff', 'rev-parse', 'ls-files', 'describe', 'blame', 'shortlog', 'grep',
  'branch', 'tag', 'remote', 'stash',
]);
const GIT_DENY_FLAGS = ['--output', '--ext-diff', '--textconv', '--no-index', '-O', '--open-files-in-pager', '--exec'];
const GIT_BRANCH_FLAGS = new Set([
  '-a', '--all', '-r', '--remotes', '-v', '-vv', '--verbose', '-l', '--list', '--show-current',
  '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--color', '--no-color',
  '--column', '--no-column', '--sort', '--format', '-i', '--ignore-case',
]);
const GIT_TAG_FLAGS = new Set([
  '-l', '--list', '-n', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at',
  '--sort', '--format', '--column', '--no-column', '-i', '--ignore-case', '--color',
]);

function flagName(word) {
  const eq = word.indexOf('=');
  return eq === -1 ? word : word.slice(0, eq);
}

function hasDeniedFlag(word, deny, { words = false } = {}) {
  if (!deny?.length || !word.startsWith('-')) return false;
  const name = flagName(word);
  if (deny.includes(name)) return true;
  if (words || word.startsWith('--')) return false;
  // Combined short options: -uo out contains -o.
  const letters = name.slice(1);
  return [...letters].some((letter) => deny.includes(`-${letter}`));
}

function isReadOnlyGit(args) {
  const [sub, ...rest] = args;
  if (!sub || !GIT_READ_SUBCOMMANDS.has(sub)) return false;

  if (sub === 'stash') return ['list', 'show'].includes(rest[0]) && rest.slice(1).every((w) => !pointsOutsideWorkingDir(w));
  if (sub === 'remote') {
    if (rest.length === 0) return true;
    if (rest.length === 1 && ['-v', '--verbose'].includes(rest[0])) return true;
    return ['get-url', 'show'].includes(rest[0]) && rest.length === 2 && !rest[1].startsWith('-');
  }
  if (sub === 'branch' || sub === 'tag') {
    const allowed = sub === 'branch' ? GIT_BRANCH_FLAGS : GIT_TAG_FLAGS;
    const listing = rest.some((w) => ['-l', '--list'].includes(flagName(w)))
      || rest.some((w) => ['--contains', '--no-contains', '--merged', '--no-merged', '--points-at'].includes(flagName(w)));
    for (const word of rest) {
      if (word.startsWith('-')) {
        if (!allowed.has(flagName(word))) return false;
      } else if (!listing) {
        // `git branch name` and `git tag name` create refs.
        return false;
      }
    }
    return true;
  }

  for (const word of rest) {
    if (word === '--') continue;
    if (hasDeniedFlag(word, GIT_DENY_FLAGS)) return false;
    if (!word.startsWith('-') && pointsOutsideWorkingDir(word)) return false;
    if (word.startsWith('-') && flagName(word) !== word && pointsOutsideWorkingDir(word.slice(word.indexOf('=') + 1))) return false;
  }
  return true;
}

function isReadOnlyProgram(words) {
  const [program, ...args] = words;
  if (program === 'git') return isReadOnlyGit(args);
  const spec = PROGRAMS[program];
  if (!spec) return false;

  if (spec.sedPrintOnly) {
    // sed -n '<address>p' [files]: anything else can write (w) or run (e).
    const flags = args.filter((w) => w.startsWith('-'));
    const rest = args.filter((w) => !w.startsWith('-'));
    if (!flags.includes('-n') || flags.some((f) => !['-n', '-E', '-r'].includes(f))) return false;
    const [script, ...files] = rest;
    if (!script || !SED_PRINT_ONLY.test(script)) return false;
    return files.every((w) => !pointsOutsideWorkingDir(w));
  }

  let positionals = 0;
  let patternSeen = false;
  let flagsEnded = false;
  for (let i = 0; i < args.length; i++) {
    const word = args[i];
    if (!flagsEnded && word === '--') {
      flagsEnded = true;
      continue;
    }
    if (!flagsEnded && word.startsWith('-') && word !== '-') {
      if (hasDeniedFlag(word, spec.deny, { words: spec.words })) return false;
      const name = flagName(word);
      if (name !== word) {
        if (pointsOutsideWorkingDir(word) && !spec.patternFlags?.includes(name)) return false;
        continue;
      }
      if (spec.valueFlags?.includes(word)) {
        const value = args[i + 1];
        if (value === undefined) return false;
        i++;
        if (spec.patternFlags?.includes(word)) {
          patternSeen = true;
          continue;
        }
        if (pointsOutsideWorkingDir(value)) return false;
        continue;
      }
      if (!spec.words && /^-[A-Za-z]./.test(word) && pointsOutsideWorkingDir(word)) return false;
      continue;
    }

    positionals++;
    if (spec.pathless) continue;
    if (spec.pattern && !patternSeen) {
      // grep PATTERN [FILE...]: the first positional is a pattern, not a path.
      patternSeen = true;
      continue;
    }
    if (pointsOutsideWorkingDir(word)) return false;
  }
  if (spec.maxPositionals !== undefined && positionals > spec.maxPositionals) return false;
  return true;
}

/**
 * True when every program in the command is known to only read, and only
 * inside the working folder. `cd <subfolder> &&` may lead the command.
 */
export function isReadOnlyShellCommand(command) {
  if (!command || typeof command !== 'string') return false;
  const raw = command.trim();
  if (!raw) return false;
  const parsed = splitShellWords(raw);
  if (!parsed) return false;

  const { segments, separators } = parsed;
  let start = 0;
  // Leading `cd dir &&` steps; after them only pipes are allowed.
  while (separators[start] === '&&') {
    const step = segments[start];
    if (step[0] !== 'cd' || step.length !== 2 || step[1] === '-' || pointsOutsideWorkingDir(step[1])) return false;
    start++;
  }
  if (separators.slice(start).some((sep) => sep !== '|')) return false;
  return segments.slice(start).every((segment) => isReadOnlyProgram(segment));
}
