/* eslint-disable react/prop-types */
import { useEffect, useRef, useState, useCallback } from 'react';
import { SquareTerminal, Plus, X, Bot, Square, RefreshCw, Globe, FolderOpen } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import authService from '../../../services/authService.js';

// ─── Auth + API helpers ───────────────────────────────────────────────────────

const PROCESS_API = import.meta.env.VITE_MAIN_URL + '/api';

function processAuthHeaders() {
  const token = authService.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchAgentSessions() {
  try {
    const res = await fetch(`${PROCESS_API}/agent/processes`, {
      credentials: 'include',
      headers: processAuthHeaders(),
    });
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
      credentials: 'include',
      headers: processAuthHeaders(),
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

function getXtermTheme() {
  const root = document.documentElement;
  if (root.classList.contains('midnight')) {
    return {
      background: '#0d1117', foreground: '#e2e8f0', cursor: '#818cf8',
      selectionBackground: '#1e2d3d',
      black: '#1e293b', brightBlack: '#475569',
      red: '#f87171', brightRed: '#fca5a5',
      green: '#4ade80', brightGreen: '#86efac',
      yellow: '#fbbf24', brightYellow: '#fde68a',
      blue: '#60a5fa', brightBlue: '#93c5fd',
      magenta: '#c084fc', brightMagenta: '#e879f9',
      cyan: '#22d3ee', brightCyan: '#67e8f9',
      white: '#f1f5f9', brightWhite: '#ffffff',
    };
  }
  if (root.classList.contains('dark')) {
    return {
      background: '#111827', foreground: '#d1d5db', cursor: '#6b7280',
      selectionBackground: '#374151',
      black: '#1f2937', brightBlack: '#4b5563',
      red: '#f87171', brightRed: '#fca5a5',
      green: '#34d399', brightGreen: '#6ee7b7',
      yellow: '#fbbf24', brightYellow: '#fde68a',
      blue: '#60a5fa', brightBlue: '#93c5fd',
      magenta: '#a78bfa', brightMagenta: '#c4b5fd',
      cyan: '#22d3ee', brightCyan: '#67e8f9',
      white: '#f9fafb', brightWhite: '#ffffff',
    };
  }
  return {
    background: '#ffffff', foreground: '#111827', cursor: '#374151',
    selectionBackground: '#dbeafe',
    black: '#1f2937', brightBlack: '#6b7280',
    red: '#dc2626', brightRed: '#ef4444',
    green: '#16a34a', brightGreen: '#22c55e',
    yellow: '#ca8a04', brightYellow: '#eab308',
    blue: '#2563eb', brightBlue: '#3b82f6',
    magenta: '#7c3aed', brightMagenta: '#8b5cf6',
    cyan: '#0891b2', brightCyan: '#06b6d4',
    white: '#f9fafb', brightWhite: '#ffffff',
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

function XtermInstance({ cwd, visible }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const termIdRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    loadXterm().then(async ({ Terminal, FitAddon }) => {
      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
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

      const termId = await window.electronAPI.terminalCreate({ cwd: cwd || undefined });
      if (disposed) { window.electronAPI.terminalKill(termId); return; }
      termIdRef.current = termId;

      window.electronAPI.onTerminalData(termId, (data) => { if (!disposed) term.write(data); });
      window.electronAPI.onTerminalExit(termId, () => {
        if (!disposed) term.writeln('\r\n\x1b[90m[Process exited — press any key to close]\x1b[0m');
      });
      term.onData((data) => { if (!disposed) window.electronAPI.terminalInput(termId, data); });
      term.onResize(({ cols, rows }) => { if (!disposed) window.electronAPI.terminalResize(termId, cols, rows); });

      const observer = new MutationObserver(() => { term.options.theme = getXtermTheme(); });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      termRef._themeObserver = observer;
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
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible || !fitRef.current || !termRef.current) return;
    const id = setTimeout(() => {
      try {
        fitRef.current?.fit();
        const { cols, rows } = termRef.current;
        if (termIdRef.current) window.electronAPI?.terminalResize(termIdRef.current, cols, rows);
      } catch {}
    }, 60);
    return () => clearTimeout(id);
  }, [visible]);

  return (
    <div ref={containerRef} className="h-full w-full" style={{ display: visible ? 'block' : 'none' }} />
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    const id = setTimeout(() => { try { termRef._fit?.fit(); } catch {} }, 60);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    const id = setTimeout(() => { try { fitRef.current?.fit(); } catch {} }, 60);
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
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50/80 dark:bg-gray-900 midnight:bg-[#161b22] px-3 py-1.5 text-[11px]">
      <span className={`h-2 w-2 shrink-0 rounded-full ${
        session.alive
          ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'
          : 'bg-gray-400 dark:bg-gray-600'
      }`} />
      <span className="font-semibold text-gray-700 dark:text-gray-300 midnight:text-slate-200">
        {session.name}
      </span>
      <span className={`rounded-full px-1.5 py-px text-[10px] font-medium shrink-0 ${
        session.alive
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
      }`}>
        {session.alive ? 'Running' : 'Stopped'}
      </span>
      {cwdShort && (
        <span className="flex min-w-0 items-center gap-1 text-gray-400 dark:text-gray-500">
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono" title={session.cwd}>{cwdShort}</span>
        </span>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 text-indigo-500 hover:underline dark:text-indigo-400"
        >
          <Globe className="h-3 w-3" />
          {url}
        </a>
      )}
      <div className="flex-1" />
      {session.alive && (
        <button
          type="button"
          onClick={() => onKill(session.key)}
          disabled={killing}
          title="Stop process"
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 disabled:opacity-40"
        >
          {killing
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : <Square className="h-3 w-3" />
          }
          Stop
        </button>
      )}
    </div>
  );
}

// ─── Tab bar buttons ──────────────────────────────────────────────────────────

function TermTab({ label, isActive, onActivate, onClose }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className={`group flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
        isActive
          ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100 midnight:bg-slate-700 midnight:text-slate-100'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:text-slate-400 midnight:hover:bg-slate-800 midnight:hover:text-slate-200'
      }`}
    >
      <SquareTerminal className="h-3 w-3 shrink-0" />
      <span className="max-w-[6rem] truncate">{label}</span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onClose(); } }}
        className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-400/20"
      >
        <X className="h-2.5 w-2.5" />
      </span>
    </button>
  );
}

function AgentSessionTab({ session, isActive, onActivate, onDismiss }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className={`group flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
        isActive
          ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100 midnight:bg-slate-700 midnight:text-slate-100'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:text-slate-400 midnight:hover:bg-slate-800 midnight:hover:text-slate-200'
      }`}
    >
      {/* Alive/stopped indicator dot */}
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
        session.alive
          ? 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.7)]'
          : 'bg-gray-400 dark:bg-gray-600'
      }`} />
      <span className="max-w-[7rem] truncate">{session.name}</span>
      {/* Dismiss (X) — only closes the tab view, does not kill the process */}
      <span
        role="button"
        tabIndex={0}
        title="Hide tab (does not stop the process)"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onDismiss(); } }}
        className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-400/20"
      >
        <X className="h-2.5 w-2.5" />
      </span>
    </button>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

let counter = 0;
const AGENT_TAB_ID = '__agent_output__';
const POLL_MS = 3000;

export default function TerminalPanel({ workingDir = null, agentOutput = [] }) {
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
              try { sessionStorage.setItem('asyncat_dismissed_agent_sessions', JSON.stringify([...next])); } catch {}
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── User PTY tab management ──────────────────────────────────────────────
  const addTab = useCallback(() => {
    const id = `term_${++counter}`;
    // Always label user shells as "shell" to avoid confusion with agent sessions
    const label = 'shell';
    setTabs(prev => [...prev, { id, label, cwd: workingDir }]);
    setActiveId(id);
  }, [workingDir]);

  const closeTab = useCallback((id) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      setActiveId(cur => cur === id ? (next[next.length - 1]?.id ?? AGENT_TAB_ID) : cur);
      return next;
    });
  }, []);

  // Open first PTY terminal automatically in Electron
  useEffect(() => {
    if (window.electronAPI?.terminalCreate) addTab();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Agent session management ─────────────────────────────────────────────
  const dismissAgentSession = useCallback((key) => {
    setDismissedSessions(prev => {
      const next = new Set([...prev, key]);
      try { sessionStorage.setItem('asyncat_dismissed_agent_sessions', JSON.stringify([...next])); } catch {}
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

  const visibleAgentSessions = agentSessions.filter(s => !dismissedSessions.has(s.key));
  const hasElectron = Boolean(window.electronAPI?.terminalCreate);
  const hasAgentSessions = visibleAgentSessions.length > 0;

  // ── Shared tab bar (used in both Electron and web paths) ─────────────────
  const tabBar = (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-800 midnight:border-slate-700 midnight:bg-[#161b22]">
      {/* Agent aggregate tab */}
      <button
        type="button"
        onClick={() => setActiveId(AGENT_TAB_ID)}
        className={`group flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
          activeId === AGENT_TAB_ID
            ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100 midnight:bg-slate-700 midnight:text-slate-100'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:text-slate-400 midnight:hover:bg-slate-800 midnight:hover:text-slate-200'
        }`}
      >
        <Bot className="h-3 w-3 shrink-0" />
        <span className="max-w-[6rem] truncate">Agent</span>
        {agentOutput.length > 0 && activeId !== AGENT_TAB_ID && (
          <span className="ml-0.5 flex h-1.5 w-1.5 rounded-full bg-indigo-500" />
        )}
      </button>

      {/* Agent session tabs */}
      {visibleAgentSessions.map(s => (
        <AgentSessionTab
          key={s.key}
          session={s}
          isActive={activeId === s.key}
          onActivate={() => setActiveId(s.key)}
          onDismiss={() => dismissAgentSession(s.key)}
        />
      ))}

      {/* Visual divider between agent tabs and user PTY tabs */}
      {hasElectron && hasAgentSessions && (
        <div className="mx-1 h-4 w-px shrink-0 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700" />
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
      {hasElectron && (
        <button
          type="button"
          onClick={addTab}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 midnight:hover:bg-slate-700 midnight:hover:text-slate-200"
          title="New terminal"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
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
        <AgentOutputInstance lines={agentOutput} visible={activeId === AGENT_TAB_ID} />
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
              <AgentSessionInstance lastOutput={s.lastOutput} visible={activeId === s.key} />
            </div>
          </div>
        </div>
      ))}

      {/* User PTY tabs — always mounted so the PTY process stays alive */}
      {tabs.map(tab => (
        <div key={tab.id} className="absolute inset-1">
          <XtermInstance cwd={tab.cwd} visible={tab.id === activeId} />
        </div>
      ))}

      {/* Empty-state: no tabs, not on a known tab */}
      {hasElectron && tabs.length === 0
        && activeId !== AGENT_TAB_ID
        && !visibleAgentSessions.some(s => s.key === activeId)
        && (
        <div className="flex h-full items-center justify-center">
          <button
            type="button"
            onClick={addTab}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <Plus className="h-4 w-4" /> Open terminal
          </button>
        </div>
      )}

      {/* Web mode with no data at all */}
      {!hasElectron && agentOutput.length === 0 && !hasAgentSessions && (
        <div className="flex h-full items-center justify-center p-6">
          <div className="text-center">
            <SquareTerminal className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-gray-600 midnight:text-slate-600" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Terminal requires the desktop app</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-gray-900 midnight:bg-[#0d1117]">
      {tabBar}
      {contentArea}
    </div>
  );
}
