import { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw, TriangleAlert, X, Search, ChevronDown,
  Mic, Cpu, Box, Globe
} from 'lucide-react';
import ActiveBrainPanel from './ActiveBrainPanel.jsx';
import EngineRuntimeSection from './EngineRuntimeSection.jsx';
import ProvidersSection from './ProvidersSection.jsx';
import LocalModelsPane from './LocalModelsPane.jsx';
import AudioModelsSection from './AudioModelsSection.jsx';
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx';
import {
  Badge, STATUS_META, conciseHardwareSummary,
  providerLabel, capabilityBadgeColor
} from './modelPageShared.jsx';
import { useModelsPageController } from './useModelsPageController.js';
import { audioApi } from '../Settings/settingApi.js';

// ── Status dot ────────────────────────────────────────────────────────────────
const StatusDot = ({ status }) => {
  const cls = {
    ready:   'bg-green-500',
    loading: 'bg-amber-400 animate-pulse',
    error:   'bg-red-500',
    idle:    'bg-gray-300 dark:bg-gray-600',
  }[status] ?? 'bg-gray-300 dark:bg-gray-600';
  return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${cls}`} />;
};

// ── Collapsible section wrapper ───────────────────────────────────────────────
const CollapsibleSection = ({
  icon: Icon, title, subtitle, badge, expanded, onToggle,
  actions, children, className = ''
}) => (
  <div className={`rounded-2xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950 overflow-hidden transition-all duration-200 ${expanded ? 'shadow-sm' : ''} ${className}`}>
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-4 px-6 py-5 hover:bg-gray-50/30 dark:hover:bg-gray-800/30 midnight:hover:bg-slate-800/30 transition-colors text-left"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {Icon && (
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border transition-colors ${
            expanded
              ? 'border-gray-200 bg-gray-900 text-white dark:border-gray-600 dark:bg-gray-100 dark:text-gray-900 midnight:border-slate-600 midnight:bg-slate-100 midnight:text-slate-900'
              : 'border-gray-100 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-500 midnight:border-slate-800 midnight:bg-slate-900 midnight:text-slate-500'
          }`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">{title}</h3>
          {subtitle && !expanded && (
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 midnight:text-slate-500 line-clamp-2">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {actions}
        {badge}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
      </div>
    </button>
    {expanded && (
      <div className="border-t border-gray-50 dark:border-gray-800/50 midnight:border-slate-800/50 px-6 pb-6">
        {children}
      </div>
    )}
  </div>
);

// ── Voice compact subtitle ────────────────────────────────────────────────────
const VoiceSubtitle = ({ sttStatus, sttModel, ttsStatus, ttsModel, loaded }) => {
  if (!loaded) return 'Checking...';
  const parts = [];
  if (sttStatus === 'ready') parts.push(`STT: ${sttModel || 'active'}`);
  else if (sttStatus === 'loading') parts.push('STT: loading...');
  else parts.push('STT: idle');
  if (ttsStatus === 'ready') parts.push(`TTS: ${ttsModel || 'active'}`);
  else if (ttsStatus === 'loading') parts.push('TTS: loading...');
  else parts.push('TTS: idle');
  return parts.join(' · ');
};

const VoiceCompactBadge = ({ sttStatus, ttsStatus }) => (
  <div className="flex items-center gap-2">
    <span className="flex items-center gap-1">
      <StatusDot status={sttStatus} />
      <span className="text-[10px] text-gray-500 dark:text-gray-400">STT</span>
    </span>
    <span className="flex items-center gap-1">
      <StatusDot status={ttsStatus} />
      <span className="text-[10px] text-gray-500 dark:text-gray-400">TTS</span>
    </span>
  </div>
);

// ── Engine compact subtitle ───────────────────────────────────────────────────
const EngineSubtitle = ({ engineData }) => {
  if (!engineData?.current) return 'Not detected';
  const hw = conciseHardwareSummary(engineData.hardware);
  const label = engineData.current.capabilityLabel || 'Unknown';
  const managed = engineData.current.managed ? ' · Managed' : '';
  return `${label} · ${hw}${managed}`;
};

// ── Main page ─────────────────────────────────────────────────────────────────
const ModelsPage = () => {
  const {
    modelContextConfig, serverStatus, setServerStatus,
    models, engineData, engineCatalog, installJob, setInstallJob,
    loadingModels, loadingStatus, loadingEngines, loadingCatalog,
    startingModel, setStartingModel, stopping, deletingModel,
    switchingEngine, installingEngine, switchError, setSwitchError,
    switchSuccess, setSwitchSuccess, installError, installSuccess,
    revertSelection, quickLoadPath, setQuickLoadPath,
    pythonInstallJob, pythonBuildError, pythonBuildSuccess,
    modelLoadCtxSizes, modelLoadCtxErrors,
    providerCatalog, providerProfiles, providerConfig,
    loadingProviders, providerAction, providerError,
    deleteConfirm, setDeleteConfirm, deleteError, setDeleteError,
    pollCleanup, clearEngineActionMessages,
    updateModelLoadCtxSize, commitModelLoadCtxSize,
    loadStatus, loadModelList, loadEngineData, loadEngineCatalog, loadProviderData,
    handleProviderSave, handleProviderDelete, handleProviderTest,
    handleProviderActivate, handleProviderDeactivate, handleLoadProviderModels,
    handleStart, handleStop, handleDelete, confirmDelete,
    handleAddPath, handleEngineSwitch, handleManagedInstall, handleBuildGpuRuntime,
  } = useModelsPageController();

  // ── Derived state ──────────────────────────────────────────────────────────
  const status = serverStatus?.status ?? 'idle';
  const { label: statusLabel, color: statusColor } = STATUS_META[status] || STATUS_META.idle;
  const isRunning = status === 'ready' || status === 'loading';
  const isReady = status === 'ready';
  const iconClass = {
    ready:   'text-green-600 dark:text-green-400',
    loading: 'text-amber-600 dark:text-amber-400 animate-pulse',
    error:   'text-red-500',
    idle:    'text-gray-400',
  }[status] ?? 'text-gray-400';

  const hardwareBadgeLabel = engineData?.hardware ? conciseHardwareSummary(engineData.hardware) : '';
  const currentCapabilityLabel = engineData?.current?.capabilityLabel || '';
  const showHardwareBadge = Boolean(
    hardwareBadgeLabel &&
    hardwareBadgeLabel.toLowerCase() !== currentCapabilityLabel.toLowerCase()
  );
  const activeProviderName = providerConfig?.provider_id === 'llamacpp-builtin'
    ? 'Built-in llama.cpp'
    : providerLabel(
        { provider_id: providerConfig?.provider_id, name: providerConfig?.name },
        providerCatalog
      );

  const isLoading = loadingStatus || loadingModels || loadingEngines || loadingCatalog || loadingProviders;
  const isBusy = Boolean(switchingEngine) || Boolean(installingEngine);

  // ── Voice summary state ────────────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState({
    sttStatus: 'idle', sttModel: null,
    ttsStatus: 'idle', ttsModel: null,
    loaded: false,
  });

  useEffect(() => {
    Promise.all([
      audioApi.whisper.getStatus().catch(() => ({ status: 'idle' })),
      audioApi.tts.getStatus().catch(() => ({ status: 'idle' })),
    ]).then(([w, t]) => {
      setVoiceState({
        sttStatus: w.status || 'idle',
        sttModel: w.model || null,
        ttsStatus: t.status || 'idle',
        ttsModel: t.model || null,
        loaded: true,
      });
    });
  }, []);

  // ── Collapsible section state ──────────────────────────────────────────────
  const [expandedVoice, setExpandedVoice] = useState(false);
  const [expandedEngine, setExpandedEngine] = useState(false);
  const [expandedLibrary, setExpandedLibrary] = useState(models.length > 0);
  const [expandedProviders, setExpandedProviders] = useState(providerProfiles.length > 0);

  const [libraryEverExpanded, setLibraryEverExpanded] = useState(false);
  useEffect(() => {
    if (!libraryEverExpanded && models.length > 0) {
      setExpandedLibrary(true);
      setLibraryEverExpanded(true);
    }
  }, [models.length, libraryEverExpanded]);

  // ── Unified search ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase();
    return models.filter(m =>
      (m.name || m.filename || '').toLowerCase().includes(q) ||
      (m.architecture || '').toLowerCase().includes(q)
    );
  }, [models, searchQuery]);

  const filteredProviders = useMemo(() => {
    if (!searchQuery.trim()) return providerProfiles;
    const q = searchQuery.toLowerCase();
    return providerProfiles.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.provider_id || '').toLowerCase().includes(q) ||
      (p.model || '').toLowerCase().includes(q)
    );
  }, [providerProfiles, searchQuery]);

  // ── Refresh handler ────────────────────────────────────────────────────────
  const handleRefresh = () => {
    clearEngineActionMessages();
    setInstallJob(null);
    loadStatus();
    loadModelList();
    loadEngineData({ clearActions: true });
    loadEngineCatalog(true);
    loadProviderData();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full flex-col bg-white text-gray-950 dark:bg-gray-900 dark:text-gray-100 midnight:bg-slate-950 midnight:text-slate-100 font-sans">
      <ConfirmDeleteDialog
        model={deleteConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200/80 bg-white dark:border-gray-800/80 dark:bg-gray-900 midnight:border-slate-800/80 midnight:bg-slate-950">
        <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 pt-5 pb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                <Cpu className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100 leading-none">
                  Models
                </h1>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <StatusDot status={status} />
                  <span>{statusLabel}</span>
                  {serverStatus?.model && (
                    <>
                      <span className="text-gray-300 dark:text-gray-700">·</span>
                      <span className="text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{serverStatus.model}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Unified search */}
            <div className="flex items-center gap-2">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search models, providers..."
                  className="w-56 pl-9 pr-8 py-1.5 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-gray-600 dark:focus:border-gray-600 midnight:border-slate-700 midnight:bg-slate-800/60 transition-all"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                onClick={handleRefresh}
                disabled={isLoading || isBusy}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:border-slate-800 midnight:bg-slate-900 midnight:text-slate-400 midnight:hover:bg-slate-800 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Delete error banner */}
        {deleteError && (
          <div className="mx-auto max-w-[1200px] px-6 lg:px-8 mt-4">
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm shadow-sm">
              <div className="flex-shrink-0 w-6 h-6 rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <TriangleAlert size={14} className="text-red-500" />
              </div>
              <span className="flex-1 text-gray-700 dark:text-gray-200">{deleteError}</span>
              <button onClick={() => setDeleteError('')} className="hover:opacity-70 text-gray-400"><X size={13} /></button>
            </div>
          </div>
        )}

        <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-8 py-6 space-y-4">

          {/* ── Brain ─────────────────────────────────────────────────────── */}
          <ActiveBrainPanel
            activeConfig={providerConfig}
            activeProviderName={activeProviderName}
            serverStatus={serverStatus}
            statusLabel={statusLabel}
            statusColor={statusColor}
            iconClass={iconClass}
            isReady={isReady}
            isRunning={isRunning}
            stopping={stopping}
            engineData={engineData}
            hardwareBadgeLabel={hardwareBadgeLabel}
            showHardwareBadge={showHardwareBadge}
            providerAction={providerAction}
            switchingEngine={switchingEngine}
            installingEngine={installingEngine}
            onStop={handleStop}
            onDeactivateProvider={handleProviderDeactivate}
          />

          {/* ── Voice ─────────────────────────────────────────────────────── */}
          <CollapsibleSection
            icon={Mic}
            title="Voice"
            subtitle={VoiceSubtitle(voiceState)}
            badge={<VoiceCompactBadge sttStatus={voiceState.sttStatus} ttsStatus={voiceState.ttsStatus} />}
            expanded={expandedVoice}
            onToggle={() => setExpandedVoice(v => !v)}
          >
            <div className="pt-5">
              <AudioModelsSection searchQuery="" />
            </div>
          </CollapsibleSection>

          {/* ── Engine ────────────────────────────────────────────────────── */}
          <CollapsibleSection
            icon={Cpu}
            title="Engine"
            subtitle={EngineSubtitle({ engineData })}
            badge={engineData?.current ? (
              <Badge color={capabilityBadgeColor(engineData.current.capabilityHint)}>
                {engineData.current.capabilityLabel}
              </Badge>
            ) : null}
            expanded={expandedEngine}
            onToggle={() => setExpandedEngine(v => !v)}
          >
            <div className="pt-5">
              <EngineRuntimeSection
                engineData={engineData}
                engineCatalog={engineCatalog}
                loadingCatalog={loadingCatalog}
                installJob={installJob}
                loading={loadingEngines}
                switchingKey={switchingEngine}
                installingKey={installingEngine}
                switchError={switchError}
                switchSuccess={switchSuccess}
                installError={installError}
                installSuccess={installSuccess}
                revertSelection={revertSelection}
                retryModel={serverStatus?.model || null}
                pythonInstallJob={pythonInstallJob}
                pythonBuildError={pythonBuildError}
                pythonBuildSuccess={pythonBuildSuccess}
                onRescan={loadEngineData}
                onSwitch={handleEngineSwitch}
                onInstall={handleManagedInstall}
                onBuildGpuRuntime={handleBuildGpuRuntime}
                onRefreshCatalog={loadEngineCatalog}
              />
            </div>
          </CollapsibleSection>

          {/* ── Model Library ─────────────────────────────────────────────── */}
          <CollapsibleSection
            icon={Box}
            title="Model Library"
            subtitle={models.length > 0
              ? `${models.length} model${models.length !== 1 ? 's' : ''} — GGUF & MLX`
              : 'No local models yet'}
            badge={models.length > 0 ? <Badge color="gray">{models.length}</Badge> : null}
            expanded={expandedLibrary}
            onToggle={() => setExpandedLibrary(v => !v)}
          >
            <div className="pt-5">
              <LocalModelsPane
                models={filteredModels}
                loadingModels={loadingModels}
                serverStatus={serverStatus}
                status={status}
                startingModel={startingModel}
                setStartingModel={setStartingModel}
                deletingModel={deletingModel}
                switchingEngine={switchingEngine}
                installingEngine={installingEngine}
                quickLoadPath={quickLoadPath}
                setQuickLoadPath={setQuickLoadPath}
                modelContextConfig={modelContextConfig}
                setServerStatus={setServerStatus}
                pollCleanup={pollCleanup}
                loadEngineData={loadEngineData}
                loadProviderData={loadProviderData}
                loadStatus={loadStatus}
                loadModelList={loadModelList}
                handleAddPath={handleAddPath}
                switchError={switchError}
                switchSuccess={switchSuccess}
                setSwitchError={setSwitchError}
                setSwitchSuccess={setSwitchSuccess}
                modelLoadCtxSizes={modelLoadCtxSizes}
                modelLoadCtxErrors={modelLoadCtxErrors}
                updateModelLoadCtxSize={updateModelLoadCtxSize}
                commitModelLoadCtxSize={commitModelLoadCtxSize}
                handleStart={handleStart}
                handleDelete={handleDelete}
              />
            </div>
          </CollapsibleSection>

          {/* ── Providers ─────────────────────────────────────────────────── */}
          <CollapsibleSection
            icon={Globe}
            title="Providers"
            subtitle={providerProfiles.length > 0
              ? `${providerProfiles.length} profile${providerProfiles.length !== 1 ? 's' : ''}${activeProviderName ? ` · ${activeProviderName} active` : ''}`
              : 'Connect cloud APIs or local endpoints'}
            badge={providerProfiles.length > 0 ? <Badge color="gray">{providerProfiles.length}</Badge> : null}
            expanded={expandedProviders}
            onToggle={() => setExpandedProviders(v => !v)}
          >
            <div className="pt-5">
              <ProvidersSection
                catalog={providerCatalog}
                profiles={filteredProviders}
                activeConfig={providerConfig}
                serverStatus={serverStatus}
                loading={loadingProviders}
                providerAction={providerAction}
                providerError={providerError}
                onRefresh={loadProviderData}
                onSave={handleProviderSave}
                onDelete={handleProviderDelete}
                onTest={handleProviderTest}
                onActivate={handleProviderActivate}
                onLoadModels={handleLoadProviderModels}
              />
            </div>
          </CollapsibleSection>

        </div>
      </div>
    </div>
  );
};

export default ModelsPage;
