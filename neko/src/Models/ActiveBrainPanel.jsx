import { Server, RefreshCw, Square, Cloud, Cpu, Gauge } from 'lucide-react';
import { Badge } from './modelPageShared.jsx';

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
  onStop,
  onDeactivateProvider,
}) => {
  const activeProviderType = activeConfig?.provider_type || '';
  const providerIsExternal = Boolean(
    activeConfig?.model
    && activeConfig?.provider_id
    && activeConfig.provider_id !== 'llamacpp-builtin'
  );
  const providerTone = activeProviderType === 'cloud' || activeProviderType === 'custom' ? 'Cloud provider' : 'Local provider';
  const primaryTitle = providerIsExternal
    ? activeProviderName
    : serverStatus?.model
      ? serverStatus.model
      : 'No model selected';
  const rawModel = activeConfig?.settings?.model_name || activeConfig?.model || '';
  const displayModel = rawModel === 'openrouter/auto' ? 'Auto (OpenRouter picks best)' : rawModel;
  const primaryDetail = providerIsExternal
    ? `${providerTone} · ${displayModel}`
    : serverStatus?.model
      ? `${isReady ? 'Running locally' : 'Loading locally'} · Built-in inference server`
      : 'Choose a local model or activate a provider below.';
  const localServerNote = serverStatus?.model
    ? `${serverStatus.status === 'ready' ? 'Loaded' : statusLabel}: ${serverStatus.model}`
    : 'No local model is loaded in memory.';
  const runtimeLabel = engineData?.current?.capabilityLabel || 'Runtime not detected';
  const engineSource = engineData?.current?.source || 'Asyncat managed engine';

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
            <div className="min-w-0 flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200/70 bg-gray-50 dark:border-gray-700/70 dark:bg-gray-800 midnight:border-slate-800 midnight:bg-slate-900">
              {providerIsExternal ? (
                  <Cloud className="w-5 h-5 text-gray-600 dark:text-gray-300 midnight:text-slate-300" />
              ) : (
                  <Server className={`w-5 h-5 ${iconClass}`} />
              )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 midnight:text-slate-500">Current brain</p>
                  {providerIsExternal ? (
                    <Badge color={activeProviderType === 'local' ? 'green' : 'blue'}>{providerTone}</Badge>
                  ) : (
                    <Badge color={statusColor}>{statusLabel}</Badge>
                  )}
                  {activeConfig?.supports_tools ? <Badge color="green">Tools enabled</Badge> : <Badge color="gray">Prompt tools</Badge>}
                </div>
                <h2 className="mt-3 text-2xl font-semibold text-gray-950 dark:text-white midnight:text-slate-100 truncate">
                  {primaryTitle}
                </h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 midnight:text-slate-300">
                  {primaryDetail}
                </p>
                {activeConfig?.base_url && providerIsExternal && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 break-all">
                    {activeConfig.base_url}
                  </p>
                )}
                {serverStatus?.error && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{serverStatus.error}</p>
                )}
              </div>
            </div>

            <div className="w-full md:w-auto flex flex-col sm:flex-row md:flex-col gap-2">
              {providerIsExternal && (
                <button
                  onClick={onDeactivateProvider}
                  disabled={Boolean(providerAction)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 midnight:border-slate-700 midnight:text-slate-300 midnight:hover:bg-slate-900"
                >
                  <Square className="w-4 h-4" />
                  Deactivate Provider
                </button>
              )}
              {isRunning && (
                <button
                  onClick={onStop}
                  disabled={stopping || Boolean(switchingEngine) || Boolean(installingEngine)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {stopping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                  {stopping ? 'Stopping...' : 'Stop Local Server'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 bg-gray-50/80 p-5 dark:border-gray-800 dark:bg-gray-900/60 midnight:border-slate-800 midnight:bg-slate-900/40 xl:border-l xl:border-t-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-3">
            <div className="flex items-start gap-3">
              <Gauge className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Runtime</p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{runtimeLabel}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{engineSource}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Server className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Local server</p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{localServerNote}</p>
                {serverStatus?.ctxSize && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{serverStatus.ctxSize.toLocaleString()} ctx</p>}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Cpu className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Machine</p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {showHardwareBadge ? hardwareBadgeLabel : 'Matches runtime'}
                </p>
                {engineData?.current && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {engineData.current.runtime === 'python' ? 'Python' : 'Native'} engine
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ActiveBrainPanel;
