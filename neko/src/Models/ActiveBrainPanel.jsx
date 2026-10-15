import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowLeftRight, Cpu, Eye, Gauge, Image, Mic, Plus, Power, Square, Volume2 } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Cat from '../components/ui/Cat.jsx';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../components/ui/Menu.jsx';
import { Badge } from './modelPageShared.jsx';
import { friendlyModelName } from '../utils/modelNames.js';
import { localModelName, sameLocalFile } from '../CommandCenter/utils/chatModel.js';
import { ProviderLogo, LocalModelLogo } from './modelLogos.jsx';
import { imagesSummary, listeningSummary, speakingSummary } from './media/mediaSummary.js';
import { useMediaStatus } from './media/useMediaStatus.js';
import { providerPlace } from './providerPlace.js';
import Skeleton from '../components/ui/Skeleton.jsx';

const DOT = {
  idle: 'bg-fg-subtle/50',
  loading: 'bg-amber-400 animate-pulse',
  ready: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

const Capability = ({ icon: Icon, label, value, status = 'idle' }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5">
    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[status] || DOT.idle}`} />
    <Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
    <span className="shrink-0 whitespace-nowrap text-fg-subtle">{label}</span>
    <span className="truncate text-fg-muted" title={typeof value === 'string' ? value : undefined}>{value}</span>
  </span>
);

Capability.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  status: PropTypes.string,
};

/**
 * The default model: what new chats, Quick ask and Cats without a model of
 * their own run on (each chat can pick its own in the composer), with a
 * switcher for the other connected providers and downloaded models. A
 * downloaded model picked there loads when a chat first uses it. When the
 * built-in engine holds another model (a chat's own), a row says which.
 * Under it, what listens, speaks and makes images (read from Models → Voice
 * and Images); a new `refreshKey` looks again.
 */
const ActiveBrainPanel = ({
  loading = false,
  activeConfig,
  activeProviderName,
  serverStatus,
  statusLabel,
  isReady,
  isRunning,
  stopping,
  engineData,
  hardwareBadgeLabel,
  showHardwareBadge,
  providerAction,
  switchingEngine,
  installingEngine,
  refreshKey = 0,
  profiles = [],
  localModels = [],
  onStop,
  onDeactivateProvider,
  onActivateProfile,
  onMakeLocalDefault,
  onBrowseProviders,
}) => {
  const switcherRef = useRef(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const media = useMediaStatus(refreshKey);
  const listening = listeningSummary(media.voice);
  const speaking = speakingSummary(media.voice);
  const makesImages = imagesSummary(media.images);

  const providerIsExternal = Boolean(activeConfig?.model && activeConfig?.provider_id && activeConfig.provider_id !== 'llamacpp-builtin');
  // MLX runs downloaded models through its own server but is set up like a provider.
  const isMlx = activeConfig?.provider_id === 'mlx-builtin';
  // A downloaded model as the default: it loads when a chat uses it, and the
  // engine may hold another chat's model meanwhile.
  const localDefault = !providerIsExternal && activeConfig?.provider_id === 'llamacpp-builtin' ? activeConfig?.model || '' : '';
  const loadedFile = serverStatus?.modelPath || serverStatus?.model || '';
  const engineHasDefault = !localDefault || sameLocalFile(loadedFile, localDefault);
  // The engine's model isn't the default: a chat's own, or any local model
  // while a provider is the default (MLX reports its own).
  const aboutOther = Boolean(serverStatus?.model) && (providerIsExternal ? !isMlx : !engineHasDefault);
  const engineHoldsOther = isRunning && aboutOther;
  const otherName = aboutOther ? localModelName(loadedFile) : '';
  const localReady = !providerIsExternal && isReady && serverStatus?.model && engineHasDefault;
  const hasActive = providerIsExternal || localReady || Boolean(localDefault);
  const rawModel = activeConfig?.settings?.model_name || activeConfig?.model || '';
  const displayModel = rawModel === 'openrouter/auto' ? 'Auto (OpenRouter picks)' : friendlyModelName(rawModel);

  let title = 'No default model';
  let subtitle = 'Choose a connected provider or load a downloaded model to start chatting.';
  let status = 'idle';
  let statusText = 'Not set up';
  if (providerIsExternal) {
    title = displayModel || activeProviderName;
    subtitle = isMlx
      ? 'Downloaded model · MLX engine'
      : `${activeProviderName} · ${providerPlace(activeConfig)}`;
    status = 'ready';
    statusText = 'Default for new chats';
  } else if (!engineHasDefault) {
    title = localModelName(localDefault);
    subtitle = 'Downloaded model · loads when a chat uses it';
    statusText = 'Default for new chats';
  } else if (serverStatus?.status === 'loading') {
    title = serverStatus.model ? localModelName(loadedFile) : 'Loading model…';
    subtitle = 'Loading into memory with the built-in engine';
    status = 'loading';
    statusText = statusLabel;
  } else if (localReady) {
    title = localModelName(loadedFile);
    subtitle = 'Downloaded model · built-in engine';
    status = 'ready';
    statusText = 'Default for new chats';
  } else if (serverStatus?.status === 'error') {
    if (localDefault) title = localModelName(localDefault);
    status = 'error';
    statusText = 'Error';
  }

  // The built-in engine's facts belong to a downloaded default or a running
  // engine, not to a cloud or custom default (or none); its context size
  // only once a model is loaded.
  const engineFacts = !providerIsExternal && (Boolean(localDefault) || isRunning);
  const runtimeLabel = engineFacts ? engineData?.current?.capabilityLabel || '' : '';
  const hardwareLabel = engineFacts && showHardwareBadge ? hardwareBadgeLabel : '';
  const supportsImageInput = Boolean(activeConfig?.capabilities?.supportsImageInput);
  const busy = Boolean(providerAction) || Boolean(switchingEngine) || Boolean(installingEngine);
  const activeProfileId = activeConfig?.profile_id;
  const ctxSize = serverStatus?.ctxSize && isRunning ? Number(serverStatus.ctxSize).toLocaleString() : '';
  const shownCtx = engineFacts ? ctxSize : '';

  // Until the default is known, a neutral card: not "Not set up" with a
  // Choose a model button that may be wrong a moment later.
  if (loading) {
    return (
      <section className="rounded-2xl border border-line bg-surface" aria-busy="true" data-default-model-loading>
        <div className="flex items-center gap-4 p-5">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[12px] text-fg-subtle">Checking…</p>
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {providerIsExternal && !isMlx ? (
            <ProviderLogo providerId={activeConfig.provider_id} name={activeProviderName} size="lg" />
          ) : isMlx ? (
            <LocalModelLogo modelName={displayModel} modelFile={rawModel} size="lg" />
          ) : localDefault || serverStatus?.model ? (
            <LocalModelLogo modelName={localDefault || serverStatus.model} modelFile={localDefault || serverStatus.model} size="lg" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-end justify-center overflow-hidden rounded-xl bg-hover pt-1.5">
              <Cat pose="head" className="w-10" outline={6} />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
              {statusText}
              {providerIsExternal && activeConfig?.supports_tools ? <Badge color="gray">Tools</Badge> : null}
            </div>
            <h2 className="mt-0.5 truncate text-[17px] font-semibold tracking-[-0.015em] text-fg" title={title}>{title}</h2>
            <p className="truncate text-[13px] text-fg-muted">{subtitle}</p>
            {serverStatus?.error ? (
              <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">
                {aboutOther ? `${otherName}: ` : ''}{serverStatus.error}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {providerIsExternal ? (
            <Button variant="ghost" size="sm" icon={Power} onClick={onDeactivateProvider} disabled={busy}>{isMlx ? 'Unload' : 'Disconnect'}</Button>
          ) : null}
          {isRunning && !engineHoldsOther ? (
            <Button variant="danger" size="sm" icon={Square} onClick={onStop} loading={stopping} disabled={busy}>Stop</Button>
          ) : null}
          <Button
            ref={switcherRef}
            variant={hasActive ? 'secondary' : 'primary'}
            size="sm"
            icon={ArrowLeftRight}
            onClick={() => setSwitcherOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={switcherOpen}
          >
            {hasActive ? 'Change default' : 'Choose a model'}
          </Button>
          <Menu anchorRef={switcherRef} open={switcherOpen} onClose={() => setSwitcherOpen(false)} placement="bottom-end" width={300} label="Default model">
            {profiles.length ? (
              <>
                <MenuLabel>Providers</MenuLabel>
                {profiles.map((profile) => (
                  <MenuItem
                    key={profile.id}
                    icon={() => <ProviderLogo providerId={profile.provider_id} name={profile.name} size="xs" />}
                    label={<span className="flex flex-col"><span className="truncate text-fg">{profile.name}</span><span className="truncate font-mono text-[11px] text-fg-subtle">{profile.settings?.model_name || friendlyModelName(profile.model)}</span></span>}
                    checked={activeProfileId === profile.id}
                    onSelect={() => onActivateProfile(profile)}
                  />
                ))}
              </>
            ) : null}
            {localModels.length ? (
              <>
                {profiles.length ? <MenuSeparator /> : null}
                <MenuLabel>Downloaded models</MenuLabel>
                {localModels.slice(0, 8).map((model) => (
                  <MenuItem
                    key={model.filename}
                    icon={() => <LocalModelLogo modelName={model.name || ''} modelFile={model.filename || ''} size="xs" />}
                    label={model.name || model.filename}
                    hint={model.sizeFormatted}
                    checked={!providerIsExternal && Boolean(localDefault
                      ? sameLocalFile(localDefault, model.path || model.filename)
                      : serverStatus?.model && (serverStatus.model === model.filename || serverStatus.model === model.name))}
                    onSelect={() => onMakeLocalDefault(model)}
                  />
                ))}
              </>
            ) : null}
            {profiles.length || localModels.length ? <MenuSeparator /> : null}
            <MenuItem icon={Plus} label="Connect a provider…" onSelect={onBrowseProviders} />
          </Menu>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-5 py-3 text-[12px]">
        <Capability icon={Mic} label="Listening" status={listening.tone} value={listening.value} />
        <Capability icon={Volume2} label="Speaking" status={speaking.tone} value={speaking.value} />
        <Capability icon={Eye} label="Sees images" status={supportsImageInput ? 'ready' : 'idle'} value={supportsImageInput ? 'Yes' : 'No'} />
        <Capability icon={Image} label="Makes images" status={makesImages.tone} value={makesImages.value} />
        {(runtimeLabel || hardwareLabel || (shownCtx && !engineHoldsOther)) ? (
          <span className="inline-flex flex-wrap items-center gap-x-3.5 gap-y-1 text-fg-subtle sm:ml-auto">
            {runtimeLabel ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Gauge className="h-3.5 w-3.5" />{runtimeLabel}</span> : null}
            {hardwareLabel ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Cpu className="h-3.5 w-3.5" />{hardwareLabel}</span> : null}
            {shownCtx && !engineHoldsOther ? <span className="whitespace-nowrap tabular-nums">{shownCtx} ctx</span> : null}
          </span>
        ) : null}
      </div>

      {engineHoldsOther ? (
        <div className="flex items-center gap-3 border-t border-line py-2 pl-5 pr-3 text-[12px]">
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[serverStatus.status === 'loading' ? 'loading' : 'ready']}`} />
            <span className="shrink-0 text-fg-subtle">{serverStatus.status === 'loading' ? 'Loading now' : 'Loaded now'}</span>
            {/* One line, so a narrow card cuts the context size before the name. */}
            <span className="truncate text-fg-muted" title={otherName}>
              {otherName}
              {ctxSize ? <span className="tabular-nums text-fg-subtle"> · {ctxSize} ctx</span> : null}
            </span>
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={onStop}
            loading={stopping}
            disabled={busy}
            title={`Frees the memory ${otherName} uses. A chat answering with it stops.`}
          >
            Unload
          </Button>
        </div>
      ) : null}
    </section>
  );
};

ActiveBrainPanel.propTypes = {
  loading: PropTypes.bool,
  activeConfig: PropTypes.object,
  activeProviderName: PropTypes.string,
  serverStatus: PropTypes.object,
  statusLabel: PropTypes.string,
  isReady: PropTypes.bool,
  isRunning: PropTypes.bool,
  stopping: PropTypes.bool,
  engineData: PropTypes.object,
  hardwareBadgeLabel: PropTypes.string,
  showHardwareBadge: PropTypes.bool,
  providerAction: PropTypes.string,
  switchingEngine: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  installingEngine: PropTypes.oneOfType([PropTypes.string, PropTypes.bool, PropTypes.object]),
  refreshKey: PropTypes.number,
  profiles: PropTypes.array,
  localModels: PropTypes.array,
  onStop: PropTypes.func,
  onDeactivateProvider: PropTypes.func,
  onActivateProfile: PropTypes.func.isRequired,
  onMakeLocalDefault: PropTypes.func.isRequired,
  onBrowseProviders: PropTypes.func.isRequired,
};

export default ActiveBrainPanel;
