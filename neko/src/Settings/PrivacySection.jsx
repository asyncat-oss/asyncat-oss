// Settings → Privacy & safety: how much agents may do on their own, where
// they may browse, how saved keys are protected, where your things are kept,
// and taking everything with you or deleting it.

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Archive, Copy, FolderOpen, Globe, KeyRound, ListChecks, Loader2, ShieldCheck, X } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import { Switch } from '../Cats/CatParts.jsx';
import { Chips } from '../Cats/CatForm.jsx';
import { profilesApi } from '../CommandCenter/api';
import catsApi from '../CommandCenter/api/catsApi.js';
import { connectorToolLabel } from '../Connectors/connectorFormat.js';
import { configApi } from './settingApi.js';
import privacyApi from '../services/privacyApi.js';
import { alwaysAllowedChatTools, newChatMode, setAlwaysAllowedChatTools, setNewChatMode } from '../services/chatDefaults.js';
import { ExportEverything, DeleteEverything, ImportChats } from './PrivacyDataParts.jsx';

const MODE_HINTS = {
  last: 'Each new chat starts in the mode you used last.',
  plan: 'New chats start in Plan: the agent reads, searches and suggests, and changes nothing.',
  action: 'New chats start in Action: the agent can change files and run commands, and asks first for risky steps.',
};

function toolLabel(name) {
  return connectorToolLabel(name) || String(name).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function ToolChips({ tools, onRevoke }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tools.map((tool) => (
        <span key={tool} title={tool} className="inline-flex items-center gap-1 rounded-md bg-hover py-0.5 pl-2 pr-1 text-[12px] text-fg">
          {toolLabel(tool)}
          <button type="button" onClick={() => onRevoke(tool)} aria-label={`Stop always allowing ${toolLabel(tool)}`} className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle hover:bg-selected hover:text-fg">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

ToolChips.propTypes = { tools: PropTypes.arrayOf(PropTypes.string).isRequired, onRevoke: PropTypes.func.isRequired };

function AlwaysAllowed() {
  const toast = useToast();
  const [chatTools, setChatTools] = useState(() => alwaysAllowedChatTools());
  const [agents, setAgents] = useState(null);
  const [cats, setCats] = useState(null);

  useEffect(() => {
    profilesApi.listProfiles().then((res) => setAgents(res.profiles || [])).catch(() => setAgents([]));
    catsApi.list().then((res) => setCats(res.cats || [])).catch(() => setCats([]));
  }, []);

  const saveChatTools = (next) => {
    setAlwaysAllowedChatTools(next);
    setChatTools(next);
  };

  const revokeAgent = async (agent, tool) => {
    const next = agent.always_allowed_tools.filter((item) => item !== tool);
    try {
      await profilesApi.updateProfile(agent.id, { alwaysAllowedTools: next });
      setAgents((list) => list.map((item) => (item.id === agent.id ? { ...item, always_allowed_tools: next } : item)));
    } catch (err) {
      toast.error("Couldn't change that", { detail: errorDetail(err) });
    }
  };

  const revokeCat = async (cat, tool) => {
    const next = cat.allowedTools.filter((item) => item !== tool);
    try {
      await catsApi.update(cat.id, { allowedTools: next });
      setCats((list) => list.map((item) => (item.id === cat.id ? { ...item, allowedTools: next } : item)));
    } catch (err) {
      toast.error("Couldn't change that", { detail: errorDetail(err) });
    }
  };

  const agentRows = (agents || []).filter((agent) => agent.always_allowed_tools?.length);
  const catRows = (cats || []).filter((cat) => cat.allowedTools?.length);
  const loading = agents === null || cats === null;
  const nothing = !chatTools.length && !agentRows.length && !catRows.length;

  return (
    <RowGroup data-always-allowed>
      {chatTools.length ? (
        <SettingsRow
          label="In chats"
          hint={(
            <>
              <span className="mb-2 block">You chose &ldquo;Always allow&rdquo; for these on an approval card. In Action mode they run without asking.</span>
              <ToolChips tools={chatTools} onRevoke={(tool) => saveChatTools(chatTools.filter((item) => item !== tool))} />
            </>
          )}
        >
          {chatTools.length > 1 ? <Button size="sm" variant="ghost" onClick={() => saveChatTools([])}>Revoke all</Button> : null}
        </SettingsRow>
      ) : null}
      {agentRows.map((agent) => (
        <SettingsRow key={agent.id} label={`Agent: ${agent.name}`} hint={<ToolChips tools={agent.always_allowed_tools} onRevoke={(tool) => revokeAgent(agent, tool)} />} />
      ))}
      {catRows.map((cat) => (
        <SettingsRow key={cat.id} label={`Cat: ${cat.name}`} hint={<ToolChips tools={cat.allowedTools} onRevoke={(tool) => revokeCat(cat, tool)} />} />
      ))}
      {nothing ? (
        <p className="px-4 py-3 text-[13px] text-fg-muted">
          {loading ? 'Loading…' : 'None. Every risky step asks you first.'}
        </p>
      ) : null}
    </RowGroup>
  );
}

function CommandSandbox() {
  const confirm = useConfirm();
  const [on, setOn] = useState(true);
  const [platform, setPlatform] = useState(() => (typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent) ? 'win32' : 'other'));

  useEffect(() => {
    configApi.getConfig()
      .then((res) => setOn(String(res?.config?.ASYNCAT_COMMAND_SANDBOX || 'auto').toLowerCase() !== 'off'))
      .catch(() => {});
    window.electronAPI?.getPlatform?.().then((value) => value && setPlatform(value)).catch(() => {});
  }, []);

  const change = async (value) => {
    if (!value) {
      const ok = await confirm({
        title: 'Turn off the command sandbox?',
        message: "Commands the agent runs will be able to change or delete any file your account can, not just files in the project. Only do this if a tool you need can't work in the sandbox.",
        confirmLabel: 'Turn off',
        destructive: true,
      });
      if (!ok) return;
    }
    setOn(value);
    configApi.updateConfig('ASYNCAT_COMMAND_SANDBOX', value ? 'auto' : 'off').catch(() => setOn(!value));
  };

  if (platform === 'win32') {
    return <SettingsRow label="Sandbox the agent's commands" hint="Not available on Windows: commands the agent runs can change any file your account can, so they ask first." />;
  }
  return (
    <SettingsRow label="Sandbox the agent's commands" hint="Commands the agent runs can read your files but only change files in the project folder, temporary folders and package caches." stack={false}>
      <Switch checked={on} onChange={change} label="Sandbox the agent's commands" />
    </SettingsRow>
  );
}

function BrowserRules({ blockedSites, onChange }) {
  const navigate = useNavigate();
  return (
    <div className="divide-y divide-line rounded-xl border border-line">
      <div className="px-4 py-3">
        <p className="text-[13px] font-medium text-fg">Sites agents never open</p>
        <p className="mb-2 mt-0.5 text-[12px] leading-5 text-fg-muted">For every agent and Cat: their web tools refuse these, and so does the built-in browser in the tabs they use. &ldquo;bank.example&rdquo; covers its subdomains too.</p>
        <Chips value={blockedSites} onChange={onChange} placeholder="bank.example" label="Add a site agents never open" />
      </div>
      <div className="px-4 py-3 text-[12px] leading-5 text-fg-muted">
        <p className="mb-1.5 text-[13px] font-medium text-fg">Always</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>Agents open web pages only: never files on your computer, Asyncat itself, or the hidden addresses cloud machines use for their settings.</li>
          <li>Agents browse in the built-in browser&apos;s Standard profile, so they are signed in where you are there. Incognito tabs are never shared.</li>
          <li>Before typing a password or card number, choosing a file, or pressing a button like Buy, Delete or Send, an agent asks you.</li>
          <li>Each Cat browses in a profile of its own, and only on the sites on its list (a Cat&apos;s Settings → Freedom).</li>
          <li>Coding agents such as Claude Code, Codex and ACP agents use their own web tools, so these rules don&apos;t reach them.</li>
        </ul>
        <p className="mt-2">
          Your own browsing (history, cookies, search engine) is set in{' '}
          <button type="button" onClick={() => navigate('/settings/workbench')} className="text-accent hover:underline">Workbench → Browser</button>.
        </p>
      </div>
    </div>
  );
}

BrowserRules.propTypes = { blockedSites: PropTypes.arrayOf(PropTypes.string).isRequired, onChange: PropTypes.func.isRequired };

function keyText(secrets) {
  if (!secrets?.encrypted) return "Saved keys aren't encrypted: Asyncat couldn't make a key to lock them with.";
  if (secrets.keySource === 'keychain') {
    return "Saved API keys, passwords and connector sign-ins are encrypted, and the key that opens them is locked by your system's keychain.";
  }
  return "Saved API keys, passwords and connector sign-ins are encrypted. The key that opens them is in a file only your account can read, because no system keychain was available (on Linux, GNOME Keyring or KWallet provides one).";
}

function Locations({ locations }) {
  const toast = useToast();
  const desktop = Boolean(window.electronAPI?.shellOpen);
  const open = (item) => {
    const isFile = item.id === 'database' || item.id === 'key';
    const action = isFile ? window.electronAPI.shellShowInFolder(item.path) : window.electronAPI.shellOpen(item.path);
    Promise.resolve(action).catch(() => {});
  };
  const copy = async (item) => {
    try {
      await navigator.clipboard.writeText(item.path);
      toast.success('Copied the path');
    } catch { /* clipboard blocked */ }
  };
  return (
    <div className="divide-y divide-line rounded-xl border border-line">
      {locations.map((item) => (
        <div key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4" data-location={item.id}>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-fg">{item.label} <span className="font-normal text-fg-subtle">· {item.note}</span></p>
            <p className="truncate font-mono text-[12px] text-fg-muted" title={item.path}>{item.path}{item.exists ? '' : ' (not made yet)'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {desktop && item.exists ? (
              <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => open(item)}>{item.id === 'database' || item.id === 'key' ? 'Show' : 'Open'}</Button>
            ) : null}
            <Button size="icon" variant="ghost" icon={Copy} aria-label={`Copy the path of ${item.label}`} onClick={() => copy(item)} />
          </div>
        </div>
      ))}
    </div>
  );
}

Locations.propTypes = { locations: PropTypes.array.isRequired };

export default function PrivacySection() {
  const toast = useToast();
  const [mode, setMode] = useState(() => newChatMode());
  const [overview, setOverview] = useState(null);

  const load = useCallback(() => {
    privacyApi.overview().then(setOverview).catch((err) => setOverview({ error: err.message }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const changeMode = (value) => {
    setMode(value);
    setNewChatMode(value);
  };

  const saveBlockedSites = async (sites) => {
    const before = overview.blockedSites;
    setOverview((current) => ({ ...current, blockedSites: sites }));
    try {
      const res = await privacyApi.setBlockedSites(sites);
      setOverview((current) => ({ ...current, blockedSites: res.blockedSites }));
      if (res.blockedSites.length < sites.length) toast.info("Some of that isn't a site, so it was left out.");
    } catch (err) {
      setOverview((current) => ({ ...current, blockedSites: before }));
      toast.error("Couldn't save the list", { detail: errorDetail(err) });
    }
  };

  return (
    <div className="space-y-8" data-privacy>
      <SettingsSection icon={ShieldCheck} title="What agents may do" hint="Plan and Action can be switched in the composer at any time; this is only where new chats start.">
        <RowGroup>
          <SettingsRow label="New chats start in" hint={MODE_HINTS[mode]}>
            <Segmented
              value={mode}
              onChange={changeMode}
              items={[{ value: 'last', label: 'Last used' }, { value: 'plan', label: 'Plan' }, { value: 'action', label: 'Action' }]}
              label="New chats start in"
              role="radiogroup"
            />
          </SettingsRow>
          <CommandSandbox />
        </RowGroup>
      </SettingsSection>

      <SettingsSection icon={ListChecks} title="Always allowed" hint="Tools that run without asking. Remove one and it asks again next time.">
        <AlwaysAllowed />
      </SettingsSection>

      <SettingsSection icon={Globe} title="Browsing">
        {overview && !overview.error ? <BrowserRules blockedSites={overview.blockedSites || []} onChange={saveBlockedSites} /> : <Loading error={overview?.error} />}
      </SettingsSection>

      <SettingsSection icon={KeyRound} title="Saved keys">
        {overview && !overview.error ? (
          <p className="rounded-xl border border-line px-4 py-3 text-[13px] leading-5 text-fg-muted" data-key-source={overview.secrets?.keySource || 'none'}>{keyText(overview.secrets)}</p>
        ) : <Loading error={overview?.error} />}
      </SettingsSection>

      <SettingsSection icon={FolderOpen} title="Where your things are kept" hint="Everything stays on this computer, except what you send to an online model or service.">
        {overview && !overview.error ? <Locations locations={overview.locations || []} /> : <Loading error={overview?.error} />}
      </SettingsSection>

      <SettingsSection icon={Archive} title="Your data">
        {overview && !overview.error ? (
          <div className="space-y-4">
            <ImportChats />
            <ExportEverything />
            <DeleteEverything pending={overview.pendingReset || null} onChanged={load} />
          </div>
        ) : <Loading error={overview?.error} />}
      </SettingsSection>
    </div>
  );
}

function Loading({ error }) {
  if (error) return <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p>;
  return <p className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
}

Loading.propTypes = { error: PropTypes.string };
