import { Square, Cpu, Gauge, MessageSquare, Mic, Volume2, Eye, Image } from 'lucide-react';
import { Badge } from './modelPageShared.jsx';

const STATUS_DOT = {
  idle:    'bg-gray-300 dark:bg-gray-600 midnight:bg-slate-600',
  loading: 'bg-amber-400 animate-pulse',
  ready:   'bg-green-500',
  error:   'bg-red-500',
};

const CapabilityStatus = ({ icon: Icon, label, value, status = 'idle' }) => (
  <div className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950/50 midnight:border-slate-800 midnight:bg-slate-900/50">
    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[status] || STATUS_DOT.idle}`} />
    <Icon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500 midnight:text-slate-500" />
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 midnight:text-slate-500">{label}</div>
      <div className="truncate text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">{value}</div>
    </div>
  </div>
);

const ActiveBrainPanel = ({
  activeConfig,
  activeProviderName,
  serverStatus,
  statusLabel,
  statusColor,
  iconClass,
  isReady,
  isRunning,
  stopping,
  engineData,
  hardwareBadgeLabel,
  showHardwareBadge,
  providerAction,
  switchingEngine,
  installingEngine,
  voiceState,
  visualModels,
  onStop,
  onDeactivateProvider,
}) => {
  const providerIsExternal = Boolean(
    activeConfig?.model &&
    activeConfig?.provider_id &&
    activeConfig.provider_id !== 'llamacpp-builtin'
  );
  const activeProviderType = activeConfig?.provider_type || '';
  const providerTone = activeProviderType === 'cloud' || activeProviderType === 'custom'
    ? 'Cloud provider'
    : 'Local provider';

  const primaryTitle = providerIsExternal
    ? activeProviderName
    : serverStatus?.model || 'No model selected';

  const rawModel = activeConfig?.settings?.model_name || activeConfig?.model || '';
  const displayModel = rawModel === 'openrouter/auto'
    ? 'Auto (OpenRouter picks best)'
    : rawModel;

  const subtitle = providerIsExternal
    ? `${providerTone} · ${displayModel}`
    : isReady
      ? 'Running locally · Built-in inference'
      : statusLabel;

  const runtimeLabel = engineData?.current?.capabilityLabel || 'Runtime not detected';
  const engineSource = engineData?.current?.source || 'Asyncat managed engine';
  const hardwareLabel = showHardwareBadge ? hardwareBadgeLabel : runtimeLabel;
  const hardwareNote = engineData?.current
    ? `${engineData.current.runtime === 'python' ? 'Python' : 'Native'} engine`
    : '';

  const dotColor = STATUS_DOT[serverStatus?.status] || STATUS_DOT.idle;
  const chatStatus = providerIsExternal ? 'ready' : serverStatus?.status || 'idle';
  const visionCount = visualModels?.vision?.length || 0;
  const imageCount = visualModels?.image?.length || 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="px-8 py-7">
        {/* Status row */}
        <div className="flex items-center gap-3 mb-5">
          <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          <span className="text-xs font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500 midnight:text-slate-500">
            {providerIsExternal ? providerTone : statusLabel}
          </span>
          {providerIsExternal && (
            <Badge color={activeProviderType === 'local' ? 'green' : 'blue'}>{providerTone}</Badge>
          )}
          {activeConfig?.supports_tools && (
            <Badge color="green">Tools</Badge>
          )}
        </div>

        {/* Title */}
        <h2 className="text-2xl font-semibold text-gray-950 dark:text-white midnight:text-slate-100 tracking-tight">
          {primaryTitle}
        </h2>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
          {subtitle}
        </p>

        {activeConfig?.base_url && providerIsExternal && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 midnight:text-slate-500 font-mono break-all">
            {activeConfig.base_url}
          </p>
        )}

        {serverStatus?.error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400 midnight:text-red-400">{serverStatus.error}</p>
        )}

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <CapabilityStatus
            icon={MessageSquare}
            label="Chat"
            status={chatStatus}
            value={providerIsExternal ? displayModel || activeProviderName : serverStatus?.model || 'Not selected'}
          />
          <CapabilityStatus
            icon={Mic}
            label="STT"
            status={voiceState?.sttStatus || 'idle'}
            value={voiceState?.sttModel || (voiceState?.sttStatus === 'ready' ? 'Ready' : 'Idle')}
          />
          <CapabilityStatus
            icon={Volume2}
            label="TTS"
            status={voiceState?.ttsStatus || 'idle'}
            value={voiceState?.ttsModel || (voiceState?.ttsStatus === 'ready' ? 'Ready' : 'Idle')}
          />
          <CapabilityStatus
            icon={Eye}
            label="Vision"
            status={visionCount ? 'ready' : 'idle'}
            value={visionCount ? `${visionCount} asset${visionCount === 1 ? '' : 's'}` : 'No assets'}
          />
          <CapabilityStatus
            icon={Image}
            label="Image"
            status={imageCount ? 'ready' : 'idle'}
            value={imageCount ? `${imageCount} asset${imageCount === 1 ? '' : 's'}` : 'No assets'}
          />
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {providerIsExternal && (
            <button
              onClick={onDeactivateProvider}
              disabled={Boolean(providerAction)}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 midnight:bg-slate-800 midnight:text-slate-100 midnight:hover:bg-slate-700 midnight:ring-1 midnight:ring-slate-700 transition-all"
            >
              <Square className="w-4 h-4" />
              Disconnect
            </button>
          )}
          {isRunning && (
            <button
              onClick={onStop}
              disabled={stopping || Boolean(switchingEngine) || Boolean(installingEngine)}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/30 midnight:border-red-900 midnight:text-red-400 midnight:hover:bg-red-950/30 transition-all"
            >
              <Square className="w-4 h-4" />
              {stopping ? 'Stopping...' : 'Stop Server'}
            </button>
          )}
        </div>

        {/* Hardware footer */}
        <div className="mt-6 pt-5 border-t border-gray-50 dark:border-gray-800/50 midnight:border-slate-800/50">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-xs text-gray-400 dark:text-gray-500 midnight:text-slate-500">
            <div className="flex items-center gap-2">
              <Gauge className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{runtimeLabel}</span>
              {engineSource && <span className="text-gray-300 dark:text-gray-700 midnight:text-slate-700">·</span>}
              {engineSource && <span>{engineSource}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{hardwareLabel}</span>
              {hardwareNote && <span className="text-gray-300 dark:text-gray-700 midnight:text-slate-700">·</span>}
              {hardwareNote && <span>{hardwareNote}</span>}
            </div>
            {serverStatus?.ctxSize && (
              <div className="flex items-center gap-2">
                <span>{Number(serverStatus.ctxSize).toLocaleString()} ctx</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ActiveBrainPanel;
