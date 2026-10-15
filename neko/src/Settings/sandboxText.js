// What Settings → Privacy & safety says about the command sandbox, from the
// status den reports (GET /api/privacy/sandbox).

export const NETWORK_CHOICES = [
  { value: 'open', label: 'Open' },
  { value: 'registries', label: 'Package registries only' },
  { value: 'off', label: 'Off' },
];

const NETWORK_HINTS = {
  open: 'Commands use the network like any other program, including services on this computer such as Asyncat, where they could read your chats.',
  registries: "Commands can only download packages (npm, PyPI, crates.io and the like). Dev servers they start can't be opened in your browser.",
  off: "Commands have no network. Your local model still works; dev servers they start can't be opened in your browser.",
};

/** The one-line hint under Network for `mode`. */
export function networkHint(mode) {
  return NETWORK_HINTS[mode] || NETWORK_HINTS.open;
}

/**
 * The status line: { tone: 'ok' | 'warn' | 'off', text }. While the sandbox
 * is on but can't start, it says why and that every command asks first.
 */
export function sandboxStatusLine(status) {
  if (!status) return { tone: 'off', text: 'Checking…' };
  if (status.state === 'unsupported') {
    return { tone: 'off', text: "Not available on Windows: commands the agent runs can change any file your account can, so they ask first." };
  }
  if (status.state === 'off') {
    return { tone: 'off', text: 'Off. Commands the agent runs can read and change any file your account can.' };
  }
  if (status.state === 'unavailable') {
    const reason = String(status.reason || "It can't start on this computer.").trim();
    return { tone: 'warn', text: `On, but it can't start: ${reason} Asking before every command.` };
  }
  return { tone: 'ok', text: "On. Commands can change only the project, temporary folders and package caches, and can't read the folders below." };
}

/**
 * A line for the settings below the status while the sandbox is on but can't
 * start: commands run without it then, so they don't apply yet. Else null.
 */
export function pendingNote(status) {
  return status?.state === 'unavailable' ? 'Network and the folders below apply once the sandbox can start.' : null;
}

/** The paths to save after allowing (or hiding again) one folder. */
export function toggleAllowed(folders, path, allow) {
  const allowed = new Set(folders.filter((item) => item.allowed).map((item) => item.path));
  if (allow) allowed.add(path);
  else allowed.delete(path);
  return [...allowed];
}

/** "~/…" for paths in the home folder, when it is known. */
export function shortPath(path, home) {
  if (!home || !path) return path;
  const base = home.replace(/\/+$/, '');
  return path === base ? '~' : path.startsWith(`${base}/`) ? `~${path.slice(base.length)}` : path;
}
