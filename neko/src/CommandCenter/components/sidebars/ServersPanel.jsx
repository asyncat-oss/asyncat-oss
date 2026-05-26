/* eslint-disable react/prop-types */
import { useState, useEffect, useCallback } from 'react';
import { Square, RefreshCw, Wifi, WifiOff, Globe, FolderOpen, Clock, Terminal } from 'lucide-react';
import { extractLocalhostUrl } from '../agent/AgentRunFeed';
import authService from '../../../services/authService.js';

const POLL_MS = 3000;

const API = import.meta.env.VITE_MAIN_URL + '/api';

function authHeaders() {
  const token = authService.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchProcesses() {
  const res = await fetch(`${API}/agent/processes`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function deleteProcess(key) {
  const res = await fetch(`${API}/agent/processes/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function relativeTime(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

function ServerRow({ session, onKill, detectedUrl }) {
  const [killing, setKilling] = useState(false);
  const url = detectedUrl || extractLocalhostUrl(session.lastOutput || '');

  const handleKill = async () => {
    setKilling(true);
    try { await onKill(session.key); } catch { /* ignore */ }
    setKilling(false);
  };

  return (
    <div className={`rounded-lg border px-3 py-2.5 transition-colors ${
      session.alive
        ? 'border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-950/10 midnight:border-green-900/30 midnight:bg-green-950/10'
        : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40 midnight:border-slate-700 midnight:bg-slate-800/30'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-2">
        <div className={`flex h-2 w-2 flex-shrink-0 rounded-full ${session.alive ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-gray-400 dark:bg-gray-600'}`} />
        <span className="flex-1 min-w-0 truncate text-[12px] font-semibold text-gray-800 dark:text-gray-200 midnight:text-slate-200">
          {session.name}
        </span>
        <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          session.alive
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 midnight:bg-green-900/20 midnight:text-green-400'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
        }`}>
          {session.alive ? 'Running' : 'Stopped'}
        </span>
        {session.alive && (
          <button
            type="button"
            onClick={handleKill}
            disabled={killing}
            title="Stop process"
            className="flex-shrink-0 flex items-center justify-center rounded p-1 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 midnight:hover:bg-red-950/20 disabled:opacity-40"
          >
            {killing
              ? <RefreshCw className="h-3 w-3 animate-spin" />
              : <Square className="h-3 w-3" />
            }
          </button>
        )}
      </div>

      {/* CWD */}
      <div className="mt-1.5 flex items-center gap-1.5 pl-4">
        <FolderOpen className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />
        <span className="min-w-0 truncate text-[11px] text-gray-500 dark:text-gray-400 midnight:text-slate-400 font-mono" title={session.cwd}>
          {session.cwd?.split('/').slice(-2).join('/') || session.cwd}
        </span>
      </div>

      {/* URL if detected */}
      {url && (
        <div className="mt-1 flex items-center gap-1.5 pl-4">
          <Globe className="h-3 w-3 flex-shrink-0 text-indigo-400" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400 midnight:text-indigo-400"
          >
            {url}
          </a>
        </div>
      )}

      {/* Last command */}
      {session.lastCommand && (
        <div className="mt-1.5 flex items-start gap-1.5 pl-4">
          <Terminal className="h-3 w-3 flex-shrink-0 mt-0.5 text-gray-400 dark:text-gray-500" />
          <span className="min-w-0 truncate text-[11px] text-gray-500 dark:text-gray-400 font-mono" title={session.lastCommand}>
            {session.lastCommand.length > 60 ? session.lastCommand.slice(0, 60) + '…' : session.lastCommand}
          </span>
        </div>
      )}

      {/* Started */}
      <div className="mt-1 flex items-center gap-1.5 pl-4">
        <Clock className="h-3 w-3 flex-shrink-0 text-gray-300 dark:text-gray-600" />
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{relativeTime(session.startedAt)}</span>
      </div>
    </div>
  );
}

export default function ServersPanel({ detectedPreviewUrl }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchProcesses();
      setSessions(data?.sessions || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const handleKill = useCallback(async (key) => {
    await deleteProcess(key);
    await load();
  }, [load]);

  const alive = sessions.filter(s => s.alive);
  const dead = sessions.filter(s => !s.alive);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-gray-300 dark:text-gray-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <WifiOff className="mx-auto mb-2 h-6 w-6 text-gray-300 dark:text-gray-600" />
          <p className="text-xs text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <Wifi className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-gray-600 midnight:text-slate-600" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No active processes</p>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
            When the agent starts a dev server or shell session,<br />it will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-4 py-2">
        <div className="flex items-center gap-2">
          {alive.length > 0 && (
            <span className="flex h-2 w-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
          )}
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {alive.length} running{dead.length > 0 ? `, ${dead.length} stopped` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center justify-center rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Session list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
        {alive.map(s => (
          <ServerRow
            key={s.key}
            session={s}
            onKill={handleKill}
            detectedUrl={s.name === 'default' ? detectedPreviewUrl : null}
          />
        ))}
        {dead.length > 0 && alive.length > 0 && (
          <div className="my-2 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800" />
        )}
        {dead.map(s => (
          <ServerRow key={s.key} session={s} onKill={handleKill} detectedUrl={null} />
        ))}
      </div>
    </div>
  );
}
