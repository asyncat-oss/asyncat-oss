// First-run setup, step 2: how Asyncat thinks. An online model with your
// key (the Models page's connect dialog, for the popular services or any
// other), or a model downloaded to run on this computer.

import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Check } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import RadioGroup from '../components/ui/RadioGroup.jsx';
import SearchField from '../components/ui/SearchField.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import StatusLine from '../components/ui/StatusLine.jsx';
import { RowGroup } from '../components/ui/Rows.jsx';
import { aiProviderApi } from '../Settings/settingApi.js';
import { ProviderLogo } from '../Models/modelLogos.jsx';
import ProviderConnectDialog from '../Models/ProviderConnectDialog.jsx';
import { buildDirectory, matchesDirectoryFilter } from '../Models/providerDirectory.js';
import LocalModelChoice from './LocalModelChoice.jsx';
import { localSetupState } from './setupFlow.js';

// The services most people have a key for, then any OpenAI-compatible one.
const FEATURED = ['openai', 'anthropic', 'gemini', 'openrouter', 'custom'];
const FEATURED_NAMES = { gemini: 'Google Gemini', custom: 'Another OpenAI-compatible service' };

const notifyModelRuntimeUpdated = () => window.dispatchEvent(new CustomEvent('asyncat-model-runtime-updated'));

function ProviderRow({ entry, connected, onConnect }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5" data-provider={entry.key}>
      <ProviderLogo providerId={entry.logoId} name={entry.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-fg">{FEATURED_NAMES[entry.key] || entry.name}</p>
        <p className="text-[12px] leading-5 text-fg-muted">{entry.description}</p>
      </div>
      {connected ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-fg-muted">
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Connected
        </span>
      ) : (
        <Button size="sm" onClick={onConnect}>Connect</Button>
      )}
    </div>
  );
}

ProviderRow.propTypes = {
  entry: PropTypes.object.isRequired,
  connected: PropTypes.bool,
  onConnect: PropTypes.func.isRequired,
};

function OnlineModels() {
  const [catalog, setCatalog] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [warning, setWarning] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setLoadError('');
    Promise.all([aiProviderApi.getCatalog(), aiProviderApi.listProfiles().catch(() => ({ profiles: [] }))])
      .then(([catalogRes, profilesRes]) => {
        setCatalog(catalogRes.providers || []);
        setProfiles(profilesRes.profiles || []);
      })
      .catch((err) => setLoadError(err.message || "Couldn't load the list of services."));
  }, []);
  useEffect(() => { load(); }, [load]);

  const directory = useMemo(() => buildDirectory(catalog || []), [catalog]);
  const connectedIds = useMemo(() => new Set(profiles.map((profile) => profile.provider_id)), [profiles]);
  const entries = showAll
    ? directory.filter((entry) => matchesDirectoryFilter(entry, 'all', query))
    : FEATURED.map((key) => directory.find((entry) => entry.key === key)).filter(Boolean);

  // Save it, check the key, and use it for chats: a provider connected here
  // is the one the person means to chat with.
  const save = async (payload) => {
    setSaving(true);
    setSaveError('');
    setWarning('');
    try {
      const res = await aiProviderApi.createProfile(payload);
      const id = res?.profile?.id;
      if (id) {
        try {
          await aiProviderApi.testProfile(id);
        } catch (err) {
          setWarning(`${payload.name} is connected, but a test message failed (${err.message}). If chats don't work, check the key in Models.`);
        }
        await aiProviderApi.activateProfile(id);
      }
      const listed = await aiProviderApi.listProfiles().catch(() => null);
      if (listed) setProfiles(listed.profiles || []);
      notifyModelRuntimeUpdated();
      setTarget(null);
    } catch (err) {
      setSaveError(err.message || "Couldn't connect it.");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <Notice tone="error" action={<Button size="xs" variant="ghost" onClick={load}>Try again</Button>}>{loadError}</Notice>;
  }
  if (!catalog) return <Skeleton className="h-[260px]" />;

  return (
    <div className="space-y-3" data-online-models>
      {showAll ? <SearchField value={query} onChange={setQuery} placeholder={`Search ${directory.length} services`} autoFocus /> : null}
      <RowGroup className={showAll ? 'max-h-[320px] overflow-y-auto' : ''}>
        {entries.map((entry) => (
          <ProviderRow
            key={entry.key}
            entry={entry}
            connected={entry.presets.some(({ preset }) => connectedIds.has(preset.providerId))}
            onConnect={() => { setSaveError(''); setTarget(entry); }}
          />
        ))}
        {!entries.length ? <p className="px-3.5 py-3 text-[13px] text-fg-muted">Nothing matches &ldquo;{query}&rdquo;.</p> : null}
      </RowGroup>
      {warning ? <Notice tone="warning">{warning}</Notice> : null}
      {!showAll ? (
        <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
          All {directory.length} services, and servers on this computer
        </Button>
      ) : null}
      {target ? (
        <ProviderConnectDialog
          catalog={catalog}
          entry={target}
          saving={saving}
          error={saveError}
          onClose={() => setTarget(null)}
          onSave={save}
        />
      ) : null}
    </div>
  );
}

/** What answers chats now, when something does. */
function InUse({ brain }) {
  if (!brain?.model) return null;
  if (brain.isLoadingModel) return <StatusLine tone="progress" text={`Loading ${brain.model}…`} detail={brain.providerName} />;
  if (!brain.isReady) return null;
  return <StatusLine tone="ok" text={`Chats use ${brain.model}`} detail={brain.isLocal ? 'On this computer' : brain.providerName} />;
}

InUse.propTypes = { brain: PropTypes.object };

export default function ModelStep({ local, brain }) {
  const [way, setWay] = useState(() => (local.job ? 'local' : null));
  // A download from before the page opened arrives after it: show it, unless a choice is made.
  const jobId = local.job?.id || null;
  useEffect(() => {
    if (jobId) setWay((current) => current || 'local');
  }, [jobId]);
  // Once a local model is downloaded, its own line says what chats use;
  // while it downloads, whatever answers chats meanwhile is still shown.
  const localState = localSetupState(local.job, brain);
  const localReports = way === 'local' && ['loading', 'ready', 'kept'].includes(localState);

  return (
    <div className="space-y-5" data-model-step>
      {localReports ? null : <InUse brain={brain} />}
      <RadioGroup
        value={way}
        onChange={setWay}
        label="How Asyncat thinks"
        options={[
          { value: 'online', label: 'Use an online model', description: 'OpenAI, Anthropic, Google and others, with your own API key.' },
          { value: 'local', label: 'Run a model on this computer', description: 'Private, works offline and costs nothing to use. One download, sized for this computer.' },
        ]}
      />
      {way === 'online' ? <OnlineModels /> : null}
      {way === 'local' ? <LocalModelChoice local={local} brain={brain} /> : null}
    </div>
  );
}

ModelStep.propTypes = {
  local: PropTypes.object.isRequired,
  brain: PropTypes.object,
};
