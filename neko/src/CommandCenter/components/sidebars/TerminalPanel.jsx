// The terminal dock: the agent's combined output, the processes the agent
// started, and (in the desktop app) the user's own shells.

import { useEffect, useRef, useState, useCallback } from 'react';
import { SquareTerminal, Plus, X, Bot, Square, RefreshCw, Globe, FolderOpen, Copy, Eraser } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useUiPreferences } from '../../../contexts/UiPreferencesContext.jsx';
import { useConfirm } from '../../../components/confirmContext';
import Button from '../../../components/ui/Button.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';

// ─── API helpers ──────────────────────────────────────────────────────────────

const PROCESS_API = import.meta.env.VITE_MAIN_URL + '/api';

async function fetchAgentSessions() {
  try {
    const res = await fetch(`${PROCESS_API}/agent/processes`);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.sessions || [];
  } catch {
    return [];
  }
}

async function killAgentSession(key) {
  try {
    const res = await fetch(`${PROCESS_API}/agent/processes/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Simple localhost URL extractor ──────────────────────────────────────────

function extractUrl(text) {
  if (!text) return null;
  const m = text.match(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?/);
  return m ? m[0] : null;
}

// ─── Theme detection ──────────────────────────────────────────────────────────

// The terminal's own ANSI colours for each theme. The page colours
// (background, text, cursor) come from the app's tokens instead, so the
// terminal sits on the same background as the panel around it.
const ANSI = {
  midnight: {
    selectionBackground: '#1e2d3d',
    black: '#1e293b', brightBlack: '#475569',
    red: '#f87171', brightRed: '#fca5a5',
    green: '#4ade80', brightGreen: '#86efac',
    yellow: '#fbbf24', brightYellow: '#fde68a',
    blue: '#60a5fa', brightBlue: '#93c5fd',
    magenta: '#c084fc', brightMagenta: '#e879f9',
    cyan: '#22d3ee', brightCyan: '#67e8f9',
    white: '#f1f5f9', brightWhite: '#ffffff',
  },
  dark: {
    selectionBackground: '#374151',
    black: '#1f2937', brightBlack: '#4b5563',
    red: '#f87171', brightRed: '#fca5a5',
    green: '#34d399', brightGreen: '#6ee7b7',
    yellow: '#fbbf24', brightYellow: '#fde68a',
    blue: '#60a5fa', brightBlue: '#93c5fd',
    magenta: '#a78bfa', brightMagenta: '#c4b5fd',
    cyan: '#22d3ee', brightCyan: '#67e8f9',
    white: '#f9fafb', brightWhite: '#ffffff',
  },
  light: {
    selectionBackground: '#dbeafe',
    black: '#1f2937', brightBlack: '#6b7280',
    red: '#dc2626', brightRed: '#ef4444',
    green: '#16a34a', brightGreen: '#22c55e',
    yellow: '#ca8a04', brightYellow: '#eab308',
    blue: '#2563eb', brightBlue: '#3b82f6',
    magenta: '#7c3aed', brightMagenta: '#8b5cf6',
    cyan: '#0891b2', brightCyan: '#06b6d4',
    white: '#f9fafb', brightWhite: '#ffffff',
  },
};

// Used only if the tokens can't be read.
const PAGE_FALLBACK = {
  midnight: { background: '#070707', foreground: '#f4f4f4', cursor: '#a0a0a0' },
  dark: { background: '#181818', foreground: '#f4f4f4', cursor: '#adadad' },
  light: { background: '#ffffff', foreground: '#111827', cursor: '#4b5563' },
};

function getXtermTheme() {
  const root = document.documentElement;
  const mode = root.classList.contains('midnight') ? 'midnight' : root.classList.contains('dark') ? 'dark' : 'light';
  const style = getComputedStyle(root);
  const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  const page = PAGE_FALLBACK[mode];
  return {
    ...ANSI[mode],
    background: token('--as-canvas', page.background),
    foreground: token('--as-fg', page.foreground),
    cursor: token('--as-fg-muted', page.cursor),
  };
}

// ─── xterm lazy-load ─────────────────────────────────────────────────────────

async function loadXterm() {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ]);
  return { Terminal, FitAddon };
}

// ─── Interactive PTY terminal (Electron only) ─────────────────────────────────

function XtermInstance({ cwd, shell, fontSize, visible, onRegisterControls }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const termIdRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    loadXterm().then(async ({ Terminal, FitAddon }) => {
      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize,
        fontFamily: '"Cascadia Code", "Fira Mono", Menlo, Monaco, monospace',
        theme: getXtermTheme(),
        allowProposedApi: true,
        scrollback: 5000,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();
      termRef.current = term;
      fitRef.current = fitAddon;

      const created = await window.electronAPI.terminalCreate({ cwd: cwd || undefined, shell });
      const termId = typeof created === 'string' ? created : created?.id;
      if (!termId) throw new Error('Terminal process could not be created.');
      if (disposed) { window.electronAPI.terminalKill(termId); return; }
      termIdRef.current = termId;

      window.electronAPI.onTerminalData(termId, (data) => { if (!disposed) term.write(data); });
      window.electronAPI.onTerminalExit(termId, () => {
        if (!disposed) term.writeln('\r\n\x1b[90m[Process exited]\x1b[0m');
      });
      term.onData((data) => { if (!disposed) window.electronAPI.terminalInput(termId, data); });
      term.onResize(({ cols, rows }) => { if (!disposed) window.electronAPI.terminalResize(termId, cols, rows); });
      onRegisterControls?.({
        clear: () => term.clear(),
        copy: async () => {
          const previousSelection = term.getSelection();
          if (!previousSelection) term.selectAll();
          const text = previousSelection || term.getSelection();
          if (text) await navigator.clipboard.writeText(text);
          if (!previousSelection) term.clearSelection();
        },
        focus: () => term.focus(),
      });
      if (visible) requestAnimationFrame(() => term.focus());

      const observer = new MutationObserver(() => { term.options.theme = getXtermTheme(); });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      termRef._themeObserver = observer;
    }).catch((reason) => {
      if (!disposed) {
        const message = reason?.message || 'Terminal process could not be started.';
        setError(message);
        termRef.current?.writeln?.(`\r\n\x1b[31m[${message}]\x1b[0m`);
      }
    });

    return () => {
      disposed = true;
      termRef._themeObserver?.disconnect();
      if (termIdRef.current) {
        window.electronAPI?.terminalKill(termIdRef.current);
        window.electronAPI?.removeAllListeners(`terminal:data:${termIdRef.current}`);
        window.electronAPI?.removeAllListeners(`terminal:exit:${termIdRef.current}`);
        termIdRef.current = null;
      }
      if (termRef.current) { termRef.current.dispose(); termRef.current = null; }
      onRegisterControls?.(null);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible || !fitRef.current || !termRef.current) return;
    const id = setTimeout(() => {
      try {
        fitRef.current?.fit();
        const { cols, rows } = termRef.current;
        if (termIdRef.current) window.electronAPI?.terminalResize(termIdRef.current, cols, rows);
        termRef.current?.focus();
      } catch { /* terminal may be between mounts */ }
    }, 60);
    return () => clearTimeout(id);
  }, [visible]);

  return (
    <div className="relative h-full w-full" style={{ display: visible ? 'block' : 'none' }}>
      <div ref={containerRef} className="h-full w-full" />
      {error && (
        <div role="alert" className="absolute inset-x-3 top-3 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">
          Could not start the terminal: {error}
        </div>
      )}
    </div>
  );
}

// ─── Agent aggregate output (all tool events combined, display-only) ──────────

function AgentOutputInstance({ lines, visible }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const writtenRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    loadXterm().then(({ Terminal, FitAddon }) => {
      if (disposed || !containerRef.current) return;
      const term = new Terminal({
        cursorBlink: false,
        fontSize: 12,
        fontFamily: '"Cascadia Code", "Fira Mono", Menlo, Monaco, monospace',
        theme: getXtermTheme(),
        allowProposedApi: true,
        scrollback: 10000,
        disableStdin: true,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();
      termRef.current = term;
      termRef._fit = fitAddon;

      const observer = new MutationObserver(() => { term.options.theme = getXtermTheme(); });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      termRef._themeObserver = observer;
    });

    return () => {
      disposed = true;
      termRef._themeObserver?.disconnect();
      termRef.current?.dispose();
      termRef.current = null;
      writtenRef.current = 0;
    };
  }, []);

  useEffect(() => {
    if (!termRef.current || !lines?.length) return;
    const newLines = lines.slice(writtenRef.current);
    if (!newLines.length) return;
    newLines.forEach(line => termRef.current.writeln(line));
    writtenRef.current = lines.length;
    termRef.current.scrollToBottom();
  }, [lines]);

  useEffect(() => {
    if (!visible || !termRef._fit || !termRef.current) return;
    const id = setTimeout(() => { try { termRef._fit?.fit(); } catch { /* terminal may be between mounts */ } }, 60);
    return () => clearTimeout(id);
  }, [visible]);

  return (
    <div ref={containerRef} className="h-full w-full" style={{ display: visible ? 'block' : 'none' }} />
  );
}

// ─── Per-session output (display-only, refreshes lastOutput on each poll) ─────

function AgentSessionInstance({ lastOutput, visible }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const prevOutputRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    loadXterm().then(({ Terminal, FitAddon }) => {
      if (disposed || !containerRef.current) return;
      const term = new Terminal({
        cursorBlink: false,
        fontSize: 12,
        fontFamily: '"Cascadia Code", "Fira Mono", Menlo, Monaco, monospace',
        theme: getXtermTheme(),
        allowProposedApi: true,
        scrollback: 5000,
        disableStdin: true,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();
      termRef.current = term;
      fitRef.current = fitAddon;

      // Write whatever was buffered before xterm was ready
      if (prevOutputRef.current) {
        term.write(prevOutputRef.current);
        term.scrollToBottom();
      }

      const observer = new MutationObserver(() => { term.options.theme = getXtermTheme(); });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      termRef._themeObserver = observer;
    });

    return () => {
      disposed = true;
      termRef._themeObserver?.disconnect();
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // On each poll: if output changed, reset xterm and rewrite the new snapshot
  useEffect(() => {
    if (!lastOutput || lastOutput === prevOutputRef.current) return;
    prevOutputRef.current = lastOutput;
    if (!termRef.current) return; // init will pick it up from prevOutputRef
    termRef.current.reset();
    termRef.current.write(lastOutput);
    termRef.current.scrollToBottom();
  }, [lastOutput]);

  useEffect(() => {
    if (!visible || !fitRef.current || !termRef.current) return;
    const id = setTimeout(() => { try { fitRef.current?.fit(); } catch { /* terminal may be between mounts */ } }, 60);
    return () => clearTimeout(id);
  }, [visible]);

  return (
    <div ref={containerRef} className="h-full w-full" style={{ display: visible ? 'block' : 'none' }} />
  );
}

// ─── Agent session status bar (shows inside the session's content area) ───────

function AgentSessionStatusBar({ session, onKill, killing }) {
  const url = extractUrl(session.lastOutput || '');
  const cwdShort = session.cwd?.split('/').slice(-2).join('/') || session.cwd || '';

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line py-1 pl-3 pr-1.5 text-[12px]">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${session.alive ? 'bg-emerald-500' : 'bg-fg-subtle/50'}`} aria-hidden="true" />
      <span className="font-medium text-fg">
        {session.name}
      </span>
      <span className={`shrink-0 rounded-md px-1.5 py-px text-[11px] font-medium ${
        session.alive
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-hover text-fg-muted'
      }`}>
        {session.alive ? 'Running' : 'Stopped'}
      </span>
      {cwdShort && (
        <span className="flex min-w-0 items-center gap-1 text-fg-subtle">
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono text-[11px]" title={session.cwd}>{cwdShort}</span>
        </span>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 text-accent hover:underline"
        >
          <Globe className="h-3 w-3" />
          {url}
        </a>
      )}
      <div className="flex-1" />
      {session.alive && (
        <Button variant="danger" size="xs" icon={Square} loading={killing} onClick={() => onKill(session.key)} title="Stop process">
          Stop
        </Button>
      )}
    </div>
  );
}

// ─── Tab bar buttons ──────────────────────────────────────────────────────────

const TAB_CLASS = 'group flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md py-1 pl-2.5 pr-1.5 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40';
const tabLook = (active) => (active ? 'bg-selected text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg');

function TabClose({ label, onClose }) {
  return (
    <span
      role="button"
      tabIndex={0}
      title={label}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onClose(); } }}
      className="rounded p-0.5 text-fg-subtle opacity-0 transition-opacity hover:bg-hover hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
    >
      <X className="h-3 w-3" />
    </span>
  );
}

function TermTab({ label, isActive, onActivate, onClose }) {
  return (
    <button type="button" onClick={onActivate} className={`${TAB_CLASS} ${tabLook(isActive)}`}>
      <SquareTerminal className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span className="max-w-[7rem] truncate">{label}</span>
      <TabClose label="Close" onClose={onClose} />
    </button>
  );
}

function AgentSessionTab({ session, isActive, onActivate, onStopAndClose, onDismiss }) {
  const confirm = useConfirm();

  // X on a running process asks first, then stops it and closes the tab;
  // X on a stopped one just closes the tab.
  const close = async () => {
    if (!session.alive) {
      onDismiss(session.key);
      return;
    }
    const stop = await confirm({
      title: `Stop ${session.name}?`,
      message: 'The process stops and its tab closes.',
      confirmLabel: 'Stop',
      destructive: true,
    });
    if (stop) onStopAndClose(session.key);
  };

  return (
    <button type="button" onClick={onActivate} className={`${TAB_CLASS} ${tabLook(isActive)}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${session.alive ? 'bg-emerald-500' : 'bg-fg-subtle/50'}`} aria-hidden="true" />
      <span className="max-w-[7rem] truncate">{session.name}</span>
      <TabClose label={session.alive ? `Stop ${session.name} and close its tab` : 'Close'} onClose={close} />
    </button>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

let counter = 0;
const AGENT_TAB_ID = '__agent_output__';
const POLL_MS = 3000;

export default function TerminalPanel({ workingDir = null, agentOutput = [], visible = true }) {
  const { workbenchPreferences } = useUiPreferences();
  const confirm = useConfirm();
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(AGENT_TAB_ID);
  const [agentSessions, setAgentSessions] = useState([]);
  const [dismissedSessions, setDismissedSessions] = useState(() => {
    try {
      const stored = sessionStorage.getItem('asyncat_dismissed_agent_sessions');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [killingKeys, setKillingKeys] = useState(new Set());
  const terminalControlsRef = useRef(new Map());

  // ── Poll agent sessions every 3 s ────────────────────────────────────────
  // Track when each session was first seen as stopped so we can auto-dismiss
  const stoppedAtRef = useRef({});

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      const sessions = await fetchAgentSessions();
      if (!mounted) return;

      // Auto-dismiss sessions that have been stopped for > 8 s
      sessions.forEach(s => {
        if (!s.alive) {
          if (!stoppedAtRef.current[s.key]) stoppedAtRef.current[s.key] = Date.now();
          if (Date.now() - stoppedAtRef.current[s.key] > 8000) {
            setDismissedSessions(prev => {
              if (prev.has(s.key)) return prev;
              const next = new Set([...prev, s.key]);
              try { sessionStorage.setItem('asyncat_dismissed_agent_sessions', JSON.stringify([...next])); } catch { /* storage may be unavailable */ }
              return next;
            });
          }
        } else {
          delete stoppedAtRef.current[s.key]; // reset if it comes back alive
        }
      });

      setAgentSessions(sessions);
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // ── User PTY tab management ──────────────────────────────────────────────
  const addTab = useCallback(() => {
    const id = `term_${++counter}`;
    const shellNames = { auto: 'Shell', pwsh: 'PowerShell 7', powershell: 'PowerShell', cmd: 'Command Prompt', zsh: 'zsh', bash: 'bash' };
    const cwd = workbenchPreferences.terminalStartDirectory === 'working' ? workingDir : null;
    const folder = cwd ? String(cwd).split(/[\\/]/).filter(Boolean).pop() : 'Home';
    const label = `${shellNames[workbenchPreferences.terminalShell] || 'Shell'} · ${folder || 'Home'}`;
    setTabs(prev => [...prev, {
      id,
      label,
      cwd,
      shell: workbenchPreferences.terminalShell,
      generation: 0,
    }]);
    setActiveId(id);
  }, [workbenchPreferences.terminalShell, workbenchPreferences.terminalStartDirectory, workingDir]);

  const closeTab = useCallback(async (id) => {
    if (workbenchPreferences.terminalConfirmClose && !(await confirm({
      title: 'Close this terminal?',
      message: 'Its process stops and the tab closes.',
      confirmLabel: 'Close',
      destructive: true,
    }))) return;
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      setActiveId(cur => cur === id ? (next[next.length - 1]?.id ?? AGENT_TAB_ID) : cur);
      return next;
    });
    terminalControlsRef.current.delete(id);
  }, [confirm, workbenchPreferences.terminalConfirmClose]);

  const restartActiveTerminal = useCallback(() => {
    setTabs((current) => current.map((tab) => tab.id === activeId
      ? { ...tab, generation: (tab.generation || 0) + 1 }
      : tab));
  }, [activeId]);

  // Open first PTY terminal automatically in Electron
  useEffect(() => {
    if (window.electronAPI?.terminalCreate) addTab();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Agent session management ─────────────────────────────────────────────
  const dismissAgentSession = useCallback((key) => {
    setDismissedSessions(prev => {
      const next = new Set([...prev, key]);
      try { sessionStorage.setItem('asyncat_dismissed_agent_sessions', JSON.stringify([...next])); } catch { /* storage may be unavailable */ }
      return next;
    });
    setActiveId(cur => cur === key ? AGENT_TAB_ID : cur);
  }, []);

  const handleKillSession = useCallback(async (key) => {
    setKillingKeys(prev => new Set([...prev, key]));
    await killAgentSession(key);
    const sessions = await fetchAgentSessions();
    setAgentSessions(sessions);
    setKillingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
  }, []);

  // Stop the process AND remove the tab
  const handleStopAndClose = useCallback(async (key) => {
    await handleKillSession(key);
    dismissAgentSession(key);
  }, [handleKillSession, dismissAgentSession]);

  const visibleAgentSessions = agentSessions.filter(s => !dismissedSessions.has(s.key));
  const hasElectron = Boolean(window.electronAPI?.terminalCreate);
  const hasAgentSessions = visibleAgentSessions.length > 0;

  // ── Shared tab bar (used in both Electron and web paths) ─────────────────
  const tabBar = (
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line px-1.5 py-1">
      {/* Agent aggregate tab */}
      <button
        type="button"
        onClick={() => setActiveId(AGENT_TAB_ID)}
        className={`${TAB_CLASS} !pr-2.5 ${tabLook(activeId === AGENT_TAB_ID)}`}
      >
        <Bot className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        <span className="max-w-[7rem] truncate">Agent output</span>
        {agentOutput.length > 0 && activeId !== AGENT_TAB_ID && (
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="New output" />
        )}
      </button>

      {/* Agent session tabs */}
      {visibleAgentSessions.map(s => (
        <AgentSessionTab
          key={s.key}
          session={s}
          isActive={activeId === s.key}
          onActivate={() => setActiveId(s.key)}
          onStopAndClose={handleStopAndClose}
          onDismiss={dismissAgentSession}
        />
      ))}

      {/* Visual divider between agent tabs and user PTY tabs */}
      {hasElectron && hasAgentSessions && (
        <div className="mx-1 h-4 w-px shrink-0 bg-line-strong" />
      )}

      {/* User PTY tabs */}
      {tabs.map(tab => (
        <TermTab
          key={tab.id}
          label={tab.label}
          isActive={tab.id === activeId}
          onActivate={() => setActiveId(tab.id)}
          onClose={() => closeTab(tab.id)}
        />
      ))}

      {/* New terminal button (Electron only) */}
      {hasElectron && <IconButton size="sm" icon={Plus} label="New terminal" onClick={addTab} />}

      <div className="flex-1" />
      {hasElectron && tabs.some(tab => tab.id === activeId) && (
        <>
          <IconButton size="sm" icon={Copy} label="Copy terminal contents" onClick={() => terminalControlsRef.current.get(activeId)?.copy?.()} />
          <IconButton size="sm" icon={Eraser} label="Clear terminal" onClick={() => terminalControlsRef.current.get(activeId)?.clear?.()} />
          <IconButton size="sm" icon={RefreshCw} label="Restart terminal" onClick={restartActiveTerminal} />
        </>
      )}

    </div>
  );

  // ── Content area (shared) ────────────────────────────────────────────────
  const contentArea = (
    <div className="relative min-h-0 flex-1">
      {/* Agent aggregate output — always mounted */}
      <div
        className="absolute inset-0 p-1"
        style={{ display: activeId === AGENT_TAB_ID ? 'block' : 'none' }}
      >
        <AgentOutputInstance lines={agentOutput} visible={visible && activeId === AGENT_TAB_ID} />
      </div>

      {/* Agent session views — always mounted once visible so xterm stays alive */}
      {visibleAgentSessions.map(s => (
        <div
          key={s.key}
          className="absolute inset-0 flex flex-col"
          style={{ display: activeId === s.key ? 'flex' : 'none' }}
        >
          <AgentSessionStatusBar session={s} onKill={handleKillSession} killing={killingKeys.has(s.key)} />
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0 p-1">
                <AgentSessionInstance lastOutput={s.lastOutput} visible={visible && activeId === s.key} />
            </div>
          </div>
        </div>
      ))}

      {/* User PTY tabs — always mounted so the PTY process stays alive */}
      {tabs.map(tab => (
        <div key={tab.id} className="absolute inset-1" style={{ display: visible && tab.id === activeId ? 'block' : 'none' }}>
          <XtermInstance
            key={`${tab.id}-${tab.generation || 0}`}
            cwd={tab.cwd}
            shell={tab.shell}
            fontSize={workbenchPreferences.terminalFontSize}
            visible={visible && tab.id === activeId}
            onRegisterControls={(controls) => {
              if (controls) terminalControlsRef.current.set(tab.id, controls);
              else terminalControlsRef.current.delete(tab.id);
            }}
          />
        </div>
      ))}

      {/* Empty-state: no tabs, not on a known tab */}
      {hasElectron && tabs.length === 0
        && activeId !== AGENT_TAB_ID
        && !visibleAgentSessions.some(s => s.key === activeId)
        && (
        <div className="flex h-full items-center justify-center">
          <Button variant="ghost" icon={Plus} onClick={addTab}>Open terminal</Button>
        </div>
      )}

      {/* Web mode with no data at all */}
      {!hasElectron && agentOutput.length === 0 && !hasAgentSessions && (
        <div className="absolute inset-0 flex items-center justify-center bg-canvas p-6">
          <div className="text-center">
            <SquareTerminal className="mx-auto mb-2 h-6 w-6 text-fg-subtle" strokeWidth={1.75} />
            <p className="text-[13px] text-fg-muted">The terminal needs the desktop app.</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {tabBar}
      {contentArea}
    </div>
  );
}
