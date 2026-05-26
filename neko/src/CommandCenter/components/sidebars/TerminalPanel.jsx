/* eslint-disable react/prop-types */
import { useEffect, useRef, useState, useCallback } from 'react';
import { SquareTerminal, Plus, X, Bot } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

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
  // Light theme
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

// ─── xterm lazy-loaded so web (non-Electron) builds don't pull it in ─────────

async function loadXterm() {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ]);
  return { Terminal, FitAddon };
}

// ─── Single terminal instance ─────────────────────────────────────────────────

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

      // 1. Build xterm instance
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

      // 2. Create the PTY only after xterm is ready (no race condition)
      const termId = await window.electronAPI.terminalCreate({ cwd: cwd || undefined });
      if (disposed) {
        window.electronAPI.terminalKill(termId);
        return;
      }
      termIdRef.current = termId;

      // 3. Wire listeners BEFORE PTY output starts flowing
      window.electronAPI.onTerminalData(termId, (data) => {
        if (!disposed) term.write(data);
      });
      window.electronAPI.onTerminalExit(termId, () => {
        if (!disposed) term.writeln('\r\n\x1b[90m[Process exited — press any key to close]\x1b[0m');
      });

      // 4. Wire keyboard input → PTY
      term.onData((data) => {
        if (!disposed) window.electronAPI.terminalInput(termId, data);
      });

      // 5. Resize → PTY
      term.onResize(({ cols, rows }) => {
        if (!disposed) window.electronAPI.terminalResize(termId, cols, rows);
      });

      // 6. Watch for theme changes (dark/midnight/light toggle)
      const observer = new MutationObserver(() => {
        term.options.theme = getXtermTheme();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

      // store observer for cleanup
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
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refit when the tab becomes visible (panel resize or tab switch)
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
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: visible ? 'block' : 'none' }}
    />
  );
}

// ─── Tab bar button ───────────────────────────────────────────────────────────

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

// ─── Agent Output (display-only xterm, no pty) ───────────────────────────────

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

  // Write any new lines from the agent and scroll to bottom
  useEffect(() => {
    if (!termRef.current || !lines?.length) return;
    const newLines = lines.slice(writtenRef.current);
    if (!newLines.length) return;
    newLines.forEach(line => termRef.current.writeln(line));
    writtenRef.current = lines.length;
    termRef.current.scrollToBottom();
  }, [lines]);

  // Refit on visibility change
  useEffect(() => {
    if (!visible || !termRef._fit || !termRef.current) return;
    const id = setTimeout(() => { try { termRef._fit?.fit(); } catch {} }, 60);
    return () => clearTimeout(id);
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: visible ? 'block' : 'none' }}
    />
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

let counter = 0;

const AGENT_TAB_ID = '__agent_output__';

export default function TerminalPanel({ workingDir = null, agentOutput = [] }) {
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const addTab = useCallback(() => {
    const id = `term_${++counter}`;
    const label = workingDir ? workingDir.split('/').filter(Boolean).pop() || 'shell' : 'shell';
    setTabs(prev => [...prev, { id, label, cwd: workingDir }]);
    setActiveId(id);
  }, [workingDir]);

  const closeTab = useCallback((id) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      setActiveId(cur => cur === id ? (next[next.length - 1]?.id || null) : cur);
      return next;
    });
  }, []);

  // Open first terminal automatically
  useEffect(() => { addTab(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!window.electronAPI?.terminalCreate) {
    // In non-Electron (web) environments, show agent output only if there is any
    if (agentOutput.length === 0) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="text-center">
            <SquareTerminal className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-gray-600 midnight:text-slate-600" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Terminal requires the desktop app</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col bg-white dark:bg-gray-900 midnight:bg-[#0d1117]">
        <div className="flex shrink-0 items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-800 midnight:border-slate-700 midnight:bg-[#161b22]">
          <button type="button" className="group flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100 midnight:bg-slate-700 midnight:text-slate-100">
            <Bot className="h-3 w-3 shrink-0" />
            Agent Output
          </button>
        </div>
        <div className="relative min-h-0 flex-1 p-1">
          <div className="absolute inset-1">
            <AgentOutputInstance lines={agentOutput} visible />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-gray-900 midnight:bg-[#0d1117]">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-800 midnight:border-slate-700 midnight:bg-[#161b22]">
        {/* Agent Output permanent tab — always visible */}
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

        {tabs.map(tab => (
          <TermTab
            key={tab.id}
            label={tab.label}
            isActive={tab.id === activeId}
            onActivate={() => setActiveId(tab.id)}
            onClose={() => closeTab(tab.id)}
          />
        ))}
        <button
          type="button"
          onClick={addTab}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 midnight:hover:bg-slate-700 midnight:hover:text-slate-200"
          title="New terminal"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Terminal area — each tab is always mounted so its PTY stays alive */}
      <div className="relative min-h-0 flex-1 p-1">
        {/* Agent Output xterm (no pty, display-only) */}
        <div className="absolute inset-1">
          <AgentOutputInstance lines={agentOutput} visible={activeId === AGENT_TAB_ID} />
        </div>

        {tabs.map(tab => (
          <div key={tab.id} className="absolute inset-1">
            <XtermInstance cwd={tab.cwd} visible={tab.id === activeId} />
          </div>
        ))}
        {tabs.length === 0 && activeId !== AGENT_TAB_ID && (
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
      </div>
    </div>
  );
}
