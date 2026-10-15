// Customize → Agents → Coding agents: agents Asyncat talks to over the Agent
// Client Protocol (Gemini CLI, Qwen Code, Goose, or any ACP agent). Asyncat
// doesn't install them: the catalog says how, and commands that download
// first (npx…) show the size and wait for an OK.

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, Copy, ExternalLink, Plug, Plus, SquarePen, Stethoscope, Trash2 } from 'lucide-react';
import { agentApi } from '../CommandCenter/api';
import Button from '../components/ui/Button.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import RadioGroup from '../components/ui/RadioGroup.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import { Badge, Panel } from '../Models/modelPageShared.jsx';
import { openWebLink } from '../utils/openWebLink.js';
import DownloadNotice from '../Connectors/DownloadNotice.jsx';
import { joinCommand, pairsText, parsePairs, splitCommand } from '../Connectors/connectorFormat.js';

function CopyLine({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-1 font-mono text-[12px] text-fg hover:bg-hover"
      title="Copy"
    >
      {text}
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-fg-subtle" />}
    </button>
  );
}

CopyLine.propTypes = { text: PropTypes.string.isRequired };

function AddAcpAgentDialog({ catalog, onClose, onAdded }) {
  const toast = useToast();
  const [view, setView] = useState('catalog');
  const [picked, setPicked] = useState(catalog[0]?.id || null);
  const [commandLine, setCommandLine] = useState('');
  const [title, setTitle] = useState('');
  const [envText, setEnvText] = useState('');
  const [pending, setPending] = useState(null); // a command waiting for the download OK
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async (payload) => {
    setBusy(true);
    setError('');
    try {
      const res = await agentApi.acpAgents.add(payload);
      toast.success(`${res.agent.title} added`);
      onAdded(res.agent);
    } catch (err) {
      setError(err.message || "Couldn't add it.");
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (view === 'catalog') {
      add({ catalogId: picked });
      return;
    }
    const { command, args } = splitCommand(commandLine);
    if (!command) {
      setError('Type the command that starts the agent in ACP mode.');
      return;
    }
    const payload = { command, args, title: title.trim() || undefined, env: parsePairs(envText) };
    setBusy(true);
    try {
      const res = await agentApi.acpAgents.checkDownload({ command, args });
      setBusy(false);
      if (res.download?.needed) {
        setPending(payload);
        return;
      }
      add(payload);
    } catch (err) {
      setBusy(false);
      setError(err.message || "Couldn't check the command.");
    }
  };

  const checkPending = useCallback((opts) => agentApi.acpAgents.checkDownload({ command: pending?.command, args: pending?.args, ...opts }), [pending]);
  const entry = catalog.find((item) => item.id === picked);

  return (
    <Dialog
      as="form"
      onSubmit={submit}
      size="md"
      title="Add an ACP agent"
      description="Any coding agent that speaks the Agent Client Protocol can answer chats here, like Claude Code and Codex."
      onClose={() => !busy && onClose()}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          {!pending ? <Button variant="primary" type="submit" loading={busy}>Add</Button> : null}
        </>
      )}
    >
      <div className="space-y-4">
        <Segmented value={view} onChange={(value) => { setView(value); setPending(null); setError(''); }} items={[{ value: 'catalog', label: 'Known agents' }, { value: 'custom', label: 'Another agent' }]} label="Agent" />
        {view === 'catalog' ? (
          <div className="space-y-2">
            <RadioGroup
              label="Agent"
              value={picked}
              onChange={setPicked}
              options={catalog.map((item) => ({
                value: item.id,
                label: item.title,
                description: (
                  <>
                    <span className="block">{item.note}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-fg-subtle">{joinCommand(item.command, item.args)}</span>
                  </>
                ),
              }))}
            />
            {entry ? (
              <div className="rounded-xl bg-hover/50 px-3.5 py-2.5 text-[12px] leading-5 text-fg-muted">
                Asyncat doesn&apos;t install agents. Install {entry.title} yourself
                {entry.install ? <>: <CopyLine text={entry.install} /></> : ' from its site'}
                {' '}
                <button type="button" onClick={() => openWebLink(entry.docs, 'system')} className="inline-flex items-center gap-0.5 text-accent hover:underline">
                  About it <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            ) : null}
          </div>
        ) : pending ? (
          <DownloadNotice check={checkPending} busy={busy} approveLabel="Download when first used, and add" onApprove={() => add({ ...pending, approveDownload: true })}>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Back</Button>
          </DownloadNotice>
        ) : (
          <div className="space-y-4">
            <Field label="Command" htmlFor="acp-command" hint="The program and its arguments that start it in ACP mode, as in a terminal.">
              <Input id="acp-command" autoFocus className="font-mono text-[12px]" value={commandLine} onChange={(event) => setCommandLine(event.target.value)} placeholder="my-agent --acp" spellCheck={false} />
            </Field>
            <Field label="Name" htmlFor="acp-title" hint="Optional. How the composer shows it.">
              <Input id="acp-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="Environment variables" htmlFor="acp-env" hint="KEY=value, one per line, for keys it needs. Saved encrypted.">
              <textarea id="acp-env" rows={2} value={envText} onChange={(event) => setEnvText(event.target.value)} spellCheck={false} className="w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 font-mono text-[12px] text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
            </Field>
          </div>
        )}
        {error ? <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p> : null}
      </div>
    </Dialog>
  );
}

AddAcpAgentDialog.propTypes = { catalog: PropTypes.array.isRequired, onClose: PropTypes.func.isRequired, onAdded: PropTypes.func.isRequired };

export default function AcpAgentsPanel({ onStartChat, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState({ agents: null, catalog: [] });
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await agentApi.acpAgents.list();
      setData({ agents: res.agents || [], catalog: res.catalog || [] });
    } catch (err) {
      setData((current) => ({ ...current, agents: current.agents || [] }));
      toast.error("Couldn't load ACP agents", { detail: errorDetail(err) });
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const check = async (agent) => {
    setChecking(agent.name);
    try {
      const res = await agentApi.acpAgents.check(agent.name);
      const who = res.check.agent ? `${res.check.agent.name}${res.check.agent.version ? ` ${res.check.agent.version}` : ''}` : agent.title;
      toast.success(`${agent.title} answered`, { detail: `${who} · protocol ${res.check.protocolVersion}${res.check.loadSession ? ' · keeps chats between turns' : ''}` });
    } catch (err) {
      toast.error(`${agent.title} didn't answer`, { detail: errorDetail(err) });
    } finally {
      setChecking('');
    }
  };

  const remove = async (agent) => {
    if (!(await confirm({ title: `Remove ${agent.title}?`, message: 'Chats it answered keep their messages. The agent itself stays installed.', confirmLabel: 'Remove', destructive: true }))) return;
    try {
      await agentApi.acpAgents.remove(agent.name);
      load();
      onChanged?.();
    } catch (err) {
      toast.error("Couldn't remove it", { detail: errorDetail(err) });
    }
  };

  const agents = data.agents || [];
  return (
    <section className="mt-6" data-acp-agents>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-fg"><Plug className="h-4 w-4 text-fg-subtle" /> ACP agents</h2>
        <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add</Button>
      </div>
      <p className="mb-3 text-[12px] leading-5 text-fg-subtle">
        Other coding agents that speak the Agent Client Protocol. They work in the chat&apos;s project folder; they ask before changing things, and Asyncat keeps their file access inside that folder.
      </p>
      <Panel className="divide-y divide-line overflow-hidden">
        {data.agents === null ? (
          <p className="px-5 py-4 text-[13px] text-fg-muted">Loading…</p>
        ) : agents.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-fg-muted">None yet. Add Gemini CLI, Qwen Code, Goose or another ACP agent you have installed.</p>
        ) : agents.map((agent) => {
          const ready = agent.installed && !agent.needsDownload;
          return (
            <div key={agent.name} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center" data-acp-agent={agent.name}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-fg">{agent.title}</span>
                  <Badge color={ready ? 'green' : agent.needsDownload ? 'amber' : 'gray'}>{ready ? 'Ready' : agent.needsDownload ? 'Needs a download' : 'Not installed'}</Badge>
                </div>
                <p className="mt-0.5 truncate font-mono text-[12px] text-fg-subtle" title={joinCommand(agent.command, agent.args)}>{joinCommand(agent.command, agent.args)}</p>
                {Object.keys(agent.env || {}).length ? <p className="text-[11px] text-fg-subtle">{pairsText(agent.env)}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {ready ? <Button size="sm" icon={SquarePen} onClick={() => onStartChat(agent.engine)}>New chat</Button> : null}
                {ready ? <Button size="sm" variant="ghost" icon={Stethoscope} loading={checking === agent.name} onClick={() => check(agent)}>Check</Button> : null}
                <Button size="icon" variant="ghost" icon={Trash2} aria-label={`Remove ${agent.title}`} onClick={() => remove(agent)} />
              </div>
            </div>
          );
        })}
      </Panel>
      {adding ? (
        <AddAcpAgentDialog
          catalog={data.catalog}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); load(); onChanged?.(); }}
        />
      ) : null}
    </section>
  );
}

AcpAgentsPanel.propTypes = { onStartChat: PropTypes.func.isRequired, onChanged: PropTypes.func };
