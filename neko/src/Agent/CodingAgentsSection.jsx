// neko/src/Agent/CodingAgentsSection.jsx
// ─── Coding agents ────────────────────────────────────────────────────────────
// Claude Code and Codex installed on this computer. A chat can hand its turns
// to one of them instead of Asyncat's own agent (picked in the composer).

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, ExternalLink, RefreshCw, SquarePen } from 'lucide-react';
import { agentApi } from '../CommandCenter/api';
import { useCommandCenter } from '../CommandCenter/context/CommandCenterContextEnhanced';
import Button from '../components/ui/Button.jsx';
import { Badge, Panel } from '../Models/modelPageShared.jsx';
import { ProviderGlyph } from '../Models/modelLogos.jsx';

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
  }).isRequired,
  onStartChat: PropTypes.func.isRequired,
};

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
          engines.map(engine => <EngineRow key={engine.id} engine={engine} onStartChat={startChat} />)
        )}
      </Panel>

      <p className="mt-4 text-[12px] leading-5 text-fg-subtle">
        Plan mode lets the agent look but not change anything. Action mode lets it edit files in the project folder.
        With auto-approve on, it gets full access and runs any command without asking.
      </p>
    </div>
  );
}
