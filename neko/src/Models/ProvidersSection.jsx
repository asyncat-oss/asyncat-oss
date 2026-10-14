import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  ArrowUpRight, CheckCircle2, CircleAlert, MoreHorizontal, Pencil, Plus,
  RefreshCw, Search, SlidersHorizontal, Trash2, WifiOff, X, Zap,
} from 'lucide-react';
import { aiProviderApi } from '../Settings/settingApi.js';
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';
import Button from '../components/ui/Button.jsx';
import Cat from '../components/ui/Cat.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { Badge, SectionHeader, providerLabel } from './modelPageShared.jsx';
import { friendlyModelName } from '../utils/modelNames.js';
import { ProviderLogo } from './modelLogos.jsx';
import { buildDirectory, matchesDirectoryFilter } from './providerDirectory.js';
import ProviderConnectDialog from './ProviderConnectDialog.jsx';
import ModelPickerDialog from './ModelPickerDialog.jsx';

const modelDisplayName = (profile) => {
  const raw = profile?.settings?.model_name || profile?.model || '';
  if (!raw) return 'No model chosen';
  if (raw === 'openrouter/auto') return 'Auto (OpenRouter picks)';
  return friendlyModelName(raw);
};

// ── A saved provider ─────────────────────────────────────────────────────────
function ProfileRow({ profile, catalog, isActive, busy, highlighted, onUse, onChangeModel, onTest, onEdit, onDelete }) {
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const tested = profile.last_test_status;

  return (
    <div
      id={`provider-card-${profile.id}`}
      className={`group flex items-center gap-3.5 rounded-xl border px-4 py-3 transition-[border-color,box-shadow,background-color] ${
        isActive ? 'border-accent/35 bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
      } ${highlighted ? 'ring-2 ring-amber-400/70' : ''}`}
    >
      <ProviderLogo providerId={profile.provider_id} name={profile.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[14px] font-medium text-fg">{profile.name}</span>
          {isActive ? <Badge color="blue">Default</Badge> : null}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-fg-muted">
          <span className="truncate font-mono text-[11.5px]">{modelDisplayName(profile)}</span>
          <span className="text-fg-subtle">·</span>
          <span className="shrink-0">{providerLabel(profile, catalog)}</span>
          {tested === 'ok' ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <span className="text-fg-subtle">·</span><CheckCircle2 className="h-3 w-3" /> Working
            </span>
          ) : null}
        </div>
        {tested && tested !== 'ok' && profile.last_test_message ? (
          <p className="mt-1 flex items-start gap-1 text-[12px] leading-4 text-red-600 dark:text-red-400">
            <CircleAlert className="mt-px h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{profile.last_test_message}</span>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {busy ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin text-fg-subtle" /> : null}
        {!isActive ? <Button size="sm" variant="secondary" icon={Zap} onClick={onUse} disabled={busy} title="New chats start on this model">Make default</Button> : null}
        <Button size="sm" variant="ghost" onClick={onChangeModel} disabled={busy} className="hidden md:inline-flex">Change model</Button>
        <Button
          ref={menuRef}
          size="icon"
          variant="ghost"
          icon={MoreHorizontal}
          aria-label={`More for ${profile.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        />
        <Menu anchorRef={menuRef} open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom-end" width={196} label={`${profile.name} options`}>
          <MenuItem icon={SlidersHorizontal} label="Change model" onSelect={onChangeModel} />
          <MenuItem icon={RefreshCw} label="Test connection" onSelect={onTest} />
          <MenuItem icon={Pencil} label="Edit" onSelect={onEdit} />
          <MenuSeparator />
          <MenuItem icon={Trash2} label="Remove" danger onSelect={onDelete} />
        </Menu>
      </div>
    </div>
  );
}

ProfileRow.propTypes = {
  profile: PropTypes.object.isRequired,
  catalog: PropTypes.array.isRequired,
  isActive: PropTypes.bool,
  busy: PropTypes.bool,
  highlighted: PropTypes.bool,
  onUse: PropTypes.func.isRequired,
  onChangeModel: PropTypes.func.isRequired,
  onTest: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

// ── A runtime found on this computer ─────────────────────────────────────────
function DetectedRow({ providerId, name, detail, busy, onConnect, onDismiss }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-dashed border-line-strong px-4 py-3">
      <ProviderLogo providerId={providerId} name={name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium text-fg">{name}</span>
          <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Found
          </span>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-fg-muted">{detail}</p>
      </div>
      <Button size="sm" variant="primary" onClick={onConnect} loading={busy}>Connect</Button>
      <Button size="icon" variant="ghost" icon={X} aria-label={`Hide ${name}`} onClick={onDismiss} />
    </div>
  );
}

DetectedRow.propTypes = {
  providerId: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  detail: PropTypes.string,
  busy: PropTypes.bool,
  onConnect: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
};

// ── Directory card ───────────────────────────────────────────────────────────
function DirectoryCard({ entry, connected, onOpen }) {
  const authLabel = entry.runtime ? 'Uses your CLI login' : entry.local ? 'Runs on your computer' : 'API key';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-xl border border-line bg-surface p-4 text-left outline-none transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[0_2px_12px_-4px_rgb(0_0_0/0.12)] focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <div className="flex items-center gap-3">
        <ProviderLogo providerId={entry.logoId} name={entry.name} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{entry.name}</span>
        {connected ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Connected" />
        ) : (
          <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>
      <p className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-[12.5px] leading-5 text-fg-muted">{entry.description}</p>
      <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
        <span>{authLabel}</span>
        {entry.presets.length > 1 ? <><span>·</span><span>{entry.presets.length} options</span></> : null}
      </div>
    </button>
  );
}

DirectoryCard.propTypes = {
  entry: PropTypes.object.isRequired,
  connected: PropTypes.bool,
  onOpen: PropTypes.func.isRequired,
};

// ── Section ──────────────────────────────────────────────────────────────────
const ProvidersSection = ({
  view = 'connected',
  onViewChange,
  catalog,
  profiles,
  activeConfig,
  serverStatus,
  loading,
  providerAction,
  providerError,
  highlightedItem,
  onRefresh,
  onSave,
  onDelete,
  onTest,
  onActivate,
  onLoadModels,
}) => {
  const network = useNetworkStatus();
  const [connectTarget, setConnectTarget] = useState(null); // { entry } | { profile }
  const [connectError, setConnectError] = useState('');
  const [pickerProfile, setPickerProfile] = useState(null);
  const [pendingActivate, setPendingActivate] = useState(null);
  const [detected, setDetected] = useState({ ollama: null, lmstudio: null, codex: null });
  const [dismissed, setDismissed] = useState(() => new Set());
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  // Look for model servers and CLIs already running on this computer.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      aiProviderApi.checkOllama().catch(() => null),
      aiProviderApi.checkLMStudio().catch(() => null),
      aiProviderApi.checkLocalRuntimes().catch(() => null),
    ]).then(([ollama, lmstudio, runtimes]) => {
      if (cancelled) return;
      setDetected({
        ollama: ollama?.found && ollama.running ? ollama : null,
        lmstudio: lmstudio?.found && lmstudio.running ? lmstudio : null,
        codex: runtimes?.codex?.found ? runtimes.codex : null,
      });
    });
    return () => { cancelled = true; };
  }, []);

  const directory = useMemo(() => buildDirectory(catalog), [catalog]);
  const visibleEntries = directory.filter((entry) => matchesDirectoryFilter(entry, filter, query));
  const configuredIds = useMemo(() => new Set(profiles.map((profile) => profile.provider_id)), [profiles]);
  const activeProfileId = activeConfig?.profile_id;
  const localServerRunning = serverStatus?.status === 'ready' || serverStatus?.status === 'loading';
  const nothingActive = !activeConfig?.model && serverStatus?.status !== 'ready';

  const suggestions = [
    detected.ollama && !configuredIds.has('ollama') && !dismissed.has('ollama') && {
      providerId: 'ollama',
      name: 'Ollama',
      detail: `Running at ${detected.ollama.baseUrl} · ${detected.ollama.models?.length || 0} models`,
      payload: { name: 'Ollama', provider_id: 'ollama', provider_type: 'local', base_url: detected.ollama.baseUrl, model: detected.ollama.models?.[0] || 'llama3.2', supports_tools: false, settings: {} },
    },
    detected.lmstudio && !configuredIds.has('lmstudio') && !dismissed.has('lmstudio') && {
      providerId: 'lmstudio',
      name: 'LM Studio',
      detail: `Running at ${detected.lmstudio.baseUrl} · ${detected.lmstudio.models?.length || 0} models`,
      payload: { name: 'LM Studio', provider_id: 'lmstudio', provider_type: 'local', base_url: detected.lmstudio.baseUrl, model: detected.lmstudio.models?.[0] || 'local-model', supports_tools: false, settings: {} },
    },
    detected.codex && !configuredIds.has('codex-cli') && !dismissed.has('codex-cli') && {
      providerId: 'codex-cli',
      name: 'Codex CLI',
      detail: `${detected.codex.version || 'codex'} · uses your Codex sign-in`,
      entry: directory.find((entry) => entry.key === 'codex-cli'),
    },
  ].filter(Boolean);

  const save = async (id, payload, { activateIfIdle = false } = {}) => {
    setConnectError('');
    try {
      const profileId = await onSave(id, payload);
      if (activateIfIdle && nothingActive && profileId) await onActivate(profileId, false);
      return profileId;
    } catch (err) {
      setConnectError(err.message || 'Could not save this provider.');
      throw err;
    }
  };

  const activate = (profile) => {
    if (profile.provider_type !== 'local' && localServerRunning) {
      setPendingActivate(profile);
      return;
    }
    onActivate(profile.id, false);
  };

  const connectedView = (
    <div className="space-y-6">
      {providerError ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-[13px] text-red-700 dark:text-red-400">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {providerError}
        </p>
      ) : null}

      {loading && profiles.length === 0 ? (
        <div className="space-y-2">
          {[0, 1].map((row) => <div key={row} className="h-[68px] animate-pulse rounded-xl bg-hover" />)}
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 pb-10 pt-8 text-center">
          <Cat pose="sleep" className="w-36" outline={4} />
          <h3 className="mt-5 text-[15px] font-semibold text-fg">No providers connected yet</h3>
          <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-fg-muted">
            Connect a cloud provider with an API key, or a model server running on this computer. Downloaded models live under Local models.
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="primary" icon={Plus} onClick={() => onViewChange('add')}>Browse providers</Button>
            <Button variant="secondary" onClick={() => onViewChange('local')}>Local models</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((profile) => (
            <ProfileRow
              key={profile.id}
              profile={profile}
              catalog={catalog}
              isActive={activeProfileId === profile.id}
              busy={providerAction === profile.id}
              highlighted={highlightedItem?.type === 'provider' && highlightedItem.id === profile.id}
              onUse={() => activate(profile)}
              onChangeModel={() => setPickerProfile(profile)}
              onTest={() => onTest(profile.id)}
              onEdit={() => { setConnectError(''); setConnectTarget({ profile }); }}
              onDelete={() => onDelete(profile.id)}
            />
          ))}
        </div>
      )}

      {suggestions.length ? (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-fg-subtle">Found on this computer</p>
          {suggestions.map((item) => (
            <DetectedRow
              key={item.providerId}
              providerId={item.providerId}
              name={item.name}
              detail={item.detail}
              busy={providerAction === 'new'}
              onConnect={() => (item.entry
                ? setConnectTarget({ entry: item.entry })
                : save(null, item.payload, { activateIfIdle: true }).catch(() => {}))}
              onDismiss={() => setDismissed((current) => new Set(current).add(item.providerId))}
            />
          ))}
        </div>
      ) : null}
    </div>
  );

  const directoryView = (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={filter}
          onChange={setFilter}
          label="Filter providers"
          items={[
            { value: 'all', label: 'All' },
            { value: 'popular', label: 'Popular' },
            { value: 'local', label: 'Local' },
            { value: 'cloud', label: 'Cloud' },
          ]}
        />
        <label className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-canvas px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 sm:w-64">
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${directory.length} providers`}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
          />
        </label>
      </div>
      {!network.fullyOnline ? (
        <p className="flex items-center gap-2 text-[12px] text-amber-700 dark:text-amber-400">
          <WifiOff className="h-3.5 w-3.5" /> You&apos;re offline. Cloud providers need an internet connection; local ones still work.
        </p>
      ) : null}
      {visibleEntries.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleEntries.map((entry) => (
            <DirectoryCard
              key={entry.key}
              entry={entry}
              connected={entry.presets.some(({ preset }) => configuredIds.has(preset.providerId))}
              onOpen={() => { setConnectError(''); setConnectTarget({ entry }); }}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-[13px] text-fg-muted">
          No providers match “{query}”. Any OpenAI-compatible service works through <button type="button" className="font-medium text-accent hover:underline" onClick={() => setConnectTarget({ entry: directory.find((entry) => entry.key === 'custom') })}>Custom</button>.
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {view === 'add' ? (
        <SectionHeader
          title="Add a provider"
          description="Cloud services connect with an API key; local servers connect by address. Everything is stored on this computer."
        />
      ) : (
        <SectionHeader
          title="Your providers"
          description="New chats start on the one marked Default. Each chat can switch to another in the composer."
          action={(
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" icon={RefreshCw} onClick={onRefresh} loading={loading}>Refresh</Button>
              {profiles.length ? <Button size="sm" variant="secondary" icon={Plus} onClick={() => onViewChange('add')}>Add provider</Button> : null}
            </div>
          )}
        />
      )}

      {view === 'add' ? directoryView : connectedView}

      {connectTarget ? (
        <ProviderConnectDialog
          catalog={catalog}
          entry={connectTarget.entry || null}
          profile={connectTarget.profile || null}
          saving={Boolean(providerAction)}
          error={connectError}
          onClose={() => setConnectTarget(null)}
          onSave={async (payload) => {
            try {
              await save(connectTarget.profile?.id || null, payload, { activateIfIdle: !connectTarget.profile });
              setConnectTarget(null);
              if (!connectTarget.profile) onViewChange('connected');
            } catch {
              // The dialog stays open and shows connectError.
            }
          }}
        />
      ) : null}

      {pickerProfile ? (
        <ModelPickerDialog
          profile={pickerProfile}
          loadModels={onLoadModels}
          saving={providerAction === pickerProfile.id}
          onClose={() => setPickerProfile(null)}
          onChoose={async (changes, andActivate) => {
            await onSave(pickerProfile.id, changes);
            const updated = { ...pickerProfile, ...changes };
            setPickerProfile(null);
            if (andActivate) activate(updated);
          }}
        />
      ) : null}

      {pendingActivate ? (
        <Dialog
          size="sm"
          title="A local model is still loaded"
          description={`Make ${pendingActivate.name} the default. ${serverStatus?.model || 'The local model'} can stay in memory or be stopped to free it up.`}
          onClose={() => setPendingActivate(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setPendingActivate(null)}>Cancel</Button>
              <Button variant="secondary" onClick={async () => { await onActivate(pendingActivate.id, false); setPendingActivate(null); }}>Keep it loaded</Button>
              <Button variant="primary" loading={providerAction === pendingActivate.id} onClick={async () => { await onActivate(pendingActivate.id, true); setPendingActivate(null); }}>Stop and switch</Button>
            </>
          )}
        />
      ) : null}
    </div>
  );
};

ProvidersSection.propTypes = {
  view: PropTypes.oneOf(['connected', 'add']),
  onViewChange: PropTypes.func.isRequired,
  catalog: PropTypes.array.isRequired,
  profiles: PropTypes.array.isRequired,
  activeConfig: PropTypes.object,
  serverStatus: PropTypes.object,
  loading: PropTypes.bool,
  providerAction: PropTypes.string,
  providerError: PropTypes.string,
  highlightedItem: PropTypes.object,
  onRefresh: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onTest: PropTypes.func.isRequired,
  onActivate: PropTypes.func.isRequired,
  onLoadModels: PropTypes.func.isRequired,
};

export default ProvidersSection;
