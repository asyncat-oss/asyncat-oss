// neko/src/Agent/CodingAgentsSection.jsx
// ─── Coding agents ────────────────────────────────────────────────────────────
// Claude Code and Codex installed on this computer: their status and plan
// usage, and their past sessions, which can be opened and continued as chats.
// A new chat can also hand its turns to one of them (picked in the composer).

import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, ExternalLink, Folder, Loader2, RefreshCw, Search, SquarePen } from 'lucide-react';
import { agentApi } from '../CommandCenter/api';
import { useCommandCenter } from '../CommandCenter/context/CommandCenterContextEnhanced';
import Button from '../components/ui/Button.jsx';
import Checkbox from '../components/ui/Checkbox.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { Badge, Panel } from '../Models/modelPageShared.jsx';
import { ProviderGlyph } from '../Models/modelLogos.jsx';
import { ENGINE_NAMES, folderName, registerEngineNames, relativeTime, usageLines } from './externalAgentFormat.js';
import AcpAgentsPanel from './AcpAgentsPanel.jsx';

const ABOUT = {
  'claude-code': 'Anthropic’s coding agent. Uses your Claude subscription or API key.',
  codex: 'OpenAI’s coding agent. Uses your ChatGPT plan or API key.',
};

function status(engine) {
  if (!engine.installed) return { label: 'Not installed', color: 'gray' };
  if (engine.signedIn === false) return { label: 'Not signed in', color: 'amber' };
  return { label: 'Ready', color: 'green' };
}

function signedInText(account) {
  if (account.includes('@')) return `Signed in as ${account}.`;
  return `Signed in with ${/^api key$/i.test(account) ? 'an API key' : `a ${account}`}.`;
}

function CopyCommand({ command }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may be blocked */ }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy command"
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-1 font-mono text-[12px] text-fg transition-colors hover:bg-hover"
    >
      {command}
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-fg-subtle" />}
    </button>
  );
}

CopyCommand.propTypes = { command: PropTypes.string.isRequired };

function UsageBars({ engine }) {
  const lines = usageLines(engine.usage);
  if (!lines.length) {
    return engine.id === 'claude-code'
      ? <p className="mt-2 text-[12px] text-fg-subtle">Plan usage shows here after Claude Code answers in Asyncat.</p>
      : null;
  }
  return (
    <div className="mt-2.5 space-y-2">
      {lines.map(line => {
        const used = line.usedPercent ?? 0;
        const tone = used >= 90 ? 'bg-red-500' : used >= 70 ? 'bg-amber-500' : 'bg-accent';
        return (
          <div key={line.key} className="max-w-sm">
            <div className="mb-1 flex items-center justify-between gap-3 text-[12px] text-fg-muted">
              <span>{line.text}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={Math.round(used)} aria-valuemin={0} aria-valuemax={100} aria-label={`${line.label} limit used`}>
              <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, Math.min(100, used))}%` }} />
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-fg-subtle">
        {engine.usage.plan ? `${engine.usage.plan[0].toUpperCase()}${engine.usage.plan.slice(1)} plan · ` : ''}
        Updated {relativeTime(new Date(engine.usage.observedAt).toISOString())}
      </p>
    </div>
  );
}

UsageBars.propTypes = {
  engine: PropTypes.shape({ id: PropTypes.string, usage: PropTypes.object }).isRequired,
};

function EngineRow({ engine, onStartChat }) {
  const state = status(engine);
  const ready = engine.installed && engine.signedIn !== false;
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-canvas">
          <ProviderGlyph providerId={engine.id} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-fg">{engine.name}</span>
            <Badge color={state.color}>{state.label}</Badge>
            {engine.version ? <span className="text-[12px] text-fg-subtle">{engine.version}</span> : null}
          </div>
          <p className="mt-0.5 text-[13px] leading-5 text-fg-muted">
            {ABOUT[engine.id]}
            {ready && engine.account ? ` ${signedInText(engine.account)}` : ''}
          </p>
          {engine.installed && engine.signedIn === false ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-fg-muted">
              Sign in from a terminal: <CopyCommand command={engine.signInCommand} />
            </div>
          ) : null}
          {ready ? <UsageBars engine={engine} /> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:pl-3">
        {ready ? (
          <Button variant="secondary" size="sm" icon={SquarePen} onClick={() => onStartChat(engine.id)}>
            New chat
          </Button>
        ) : !engine.installed ? (
          <Button variant="secondary" size="sm" icon={ExternalLink} onClick={() => window.open(engine.installUrl, '_blank', 'noopener')}>
            How to install
          </Button>
        ) : null}
      </div>
    </div>
  );
}

EngineRow.propTypes = {
  engine: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    installed: PropTypes.bool,
    signedIn: PropTypes.bool,
    version: PropTypes.string,
    account: PropTypes.string,
    signInCommand: PropTypes.string,
    installUrl: PropTypes.string,
    usage: PropTypes.object,
  }).isRequired,
  onStartChat: PropTypes.func.isRequired,
};

const ENGINE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
];

function SessionsPanel() {
  const navigate = useNavigate();
  const toast = useToast();
  const { triggerConversationRefresh } = useCommandCenter();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [showAutomated, setShowAutomated] = useState(false);
  const [openingKey, setOpeningKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    agentApi.listExternalSessions({ limit: 150 })
      .then(result => { if (!cancelled) setSessions(result?.sessions || []); })
      .catch(() => { if (!cancelled) setSessions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sessions.filter(session =>
      (filter === 'all' || session.engine === filter)
      && (showAutomated || (!session.automated && !session.temporary))
      && (!needle || session.title.toLowerCase().includes(needle) || String(session.cwd || '').toLowerCase().includes(needle)));
  }, [filter, query, sessions, showAutomated]);

  const open = async (session) => {
    if (session.conversationId) {
      navigate(`/conversations/${session.conversationId}`);
      return;
    }
    const key = `${session.engine}:${session.id}`;
    setOpeningKey(key);
    try {
      const result = await agentApi.openExternalSession(session.engine, session.id);
      if (!result?.conversationId) throw new Error(result?.error || "It couldn't be opened.");
      navigate(`/conversations/${result.conversationId}`);
      triggerConversationRefresh?.();
    } catch (err) {
      toast.error(`Couldn't open that ${ENGINE_NAMES[session.engine]} session`, { detail: errorDetail(err) });
      setOpeningKey(null);
    }
  };

  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-fg">Sessions on this computer</h2>
        <p className="mt-0.5 text-[13px] leading-5 text-fg-muted">
          Your Claude Code and Codex conversations, from the terminal or their apps. Open one to read it here and carry on
          where you left off; it keeps working in its own folder.
        </p>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={filter} onChange={setFilter} items={ENGINE_FILTERS} label="Agent" />
        <label className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search sessions"
            className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
          />
        </label>
        <Checkbox checked={showAutomated} onChange={setShowAutomated} label="Show automated and temporary runs" />
      </div>
      <Panel className="divide-y divide-line overflow-hidden">
        {loading ? (
          <p className="px-5 py-4 text-[13px] text-fg-muted">Looking for sessions…</p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-fg-muted">{sessions.length ? 'No sessions match.' : 'No Claude Code or Codex sessions on this computer yet.'}</p>
        ) : visible.map(session => {
          const key = `${session.engine}:${session.id}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => open(session)}
              disabled={Boolean(openingKey)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-hover disabled:cursor-wait"
            >
              {openingKey === key
                ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-subtle" />
                : <ProviderGlyph providerId={session.engine} className="h-4 w-4 shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">{session.title}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-fg-subtle">
                  <Folder className="h-3 w-3 shrink-0" />
                  <span className="truncate" title={session.cwd || ''}>{folderName(session.cwd) || 'No folder'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">{relativeTime(session.updatedAt)}</span>
                </span>
              </span>
              {session.conversationId ? <Badge color="blue">In Asyncat</Badge> : null}
              {session.automated ? <Badge>Automated</Badge> : session.temporary ? <Badge>Temporary</Badge> : null}
            </button>
          );
        })}
      </Panel>
    </section>
  );
}

export default function CodingAgentsSection() {
  const navigate = useNavigate();
  const { handleNewConversation } = useCommandCenter();
  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await agentApi.getEngines();
      registerEngineNames(result?.engines);
      setEngines(result?.engines || []);
    } catch (err) {
      setError(err?.message || "Couldn't check for coding agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startChat = useCallback(async (engineId) => {
    try { localStorage.setItem('asyncat_engine', engineId); } catch { /* localStorage may be unavailable */ }
    navigate('/home');
    await handleNewConversation?.();
  }, [handleNewConversation, navigate]);

  return (
    <div className="max-w-3xl px-6 py-6 lg:px-8">
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="max-w-xl text-[13px] leading-5 text-fg-muted">
          Hand a chat to a coding agent installed on this computer. Pick one under the message box before your first
          message; it keeps answering for the rest of that chat and works in the chat’s project folder.
        </p>
        <Button variant="ghost" size="icon" icon={RefreshCw} loading={loading} onClick={load} title="Check again" aria-label="Check again" />
      </div>

      <Panel className="divide-y divide-line overflow-hidden">
        {error ? (
          <p className="px-5 py-4 text-[13px] text-red-600 dark:text-red-400">{error}</p>
        ) : engines.length === 0 && loading ? (
          <p className="px-5 py-4 text-[13px] text-fg-muted">Checking this computer…</p>
        ) : (
          engines.filter(engine => !engine.acp).map(engine => <EngineRow key={engine.id} engine={engine} onStartChat={startChat} />)
        )}
      </Panel>

      <AcpAgentsPanel onStartChat={startChat} onChanged={load} />

      <p className="mt-4 text-[12px] leading-5 text-fg-subtle">
        Plan mode lets the agent look but not change anything. Action mode lets it edit files in the project folder:
        Claude Code asks you before running other commands, and Codex runs them in a sandbox that can only change the
        project folder. With auto-approve on, either gets full access and runs any command without asking.
      </p>

      <SessionsPanel />
    </div>
  );
}
