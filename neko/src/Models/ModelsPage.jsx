// ModelsPage.jsx — Redesigned with tabbed navigation + unified search
import { useState, useMemo } from 'react';
import {
  RefreshCw, Cpu, TriangleAlert, X, Search,
  Brain, Globe, Mic, SlidersHorizontal, ChevronDown
} from 'lucide-react';
import ActiveBrainPanel from './ActiveBrainPanel.jsx';
import EngineRuntimeSection from './EngineRuntimeSection.jsx';
import ProvidersSection from './ProvidersSection.jsx';
import LocalModelsPane from './LocalModelsPane.jsx';
import AudioModelsSection from './AudioModelsSection.jsx';
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx';
import { Badge, STATUS_META, conciseHardwareSummary, providerLabel } from './modelPageShared.jsx';
import { useModelsPageController } from './useModelsPageController.js';

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'library',   label: 'Library',   icon: Brain,           desc: 'Local GGUF & MLX models' },
  { id: 'providers', label: 'Providers', icon: Globe,           desc: 'Cloud & custom endpoints' },
  { id: 'audio',     label: 'Audio',     icon: Mic,             desc: 'Whisper STT · Piper TTS' },
  { id: 'runtime',   label: 'Runtime',   icon: SlidersHorizontal, desc: 'Engine & hardware setup' },
];

// ── Compact status dot ─────────────────────────────────────────────────────────
const StatusDot = ({ status }) => {
  const cls = {
    ready:   'bg-green-500',
    loading: 'bg-amber-400 animate-pulse',
    error:   'bg-red-500',
    idle:    'bg-gray-300 dark:bg-gray-600',
  }[status] ?? 'bg-gray-300 dark:bg-gray-600';
  return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${cls}`} />;
};

// ── Tab button ─────────────────────────────────────────────────────────────────
const TabButton = ({ tab, active, onClick, badge }) => {
  const Icon = tab.icon;
  return (
    <button
      onClick={() => onClick(tab.id)}
      className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all whitespace-nowrap
        ${active
          ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 midnight:bg-slate-100 midnight:text-slate-900 shadow-sm'
          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 midnight:text-slate-500 midnight:hover:text-slate-200 midnight:hover:bg-slate-800'
        }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{tab.label}</span>
      {badge && (
        <span className={`ml-0.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold
          ${active ? 'bg-white/20 text-white dark:bg-black/20 dark:text-black' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
          {badge}
        </span>
      )}
    </button>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────────
const ModelsPage = () => {
  const [activeTab, setActiveTab] = useState('library');
  const [searchQuery, setSearchQuery] = useState('');

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
  const showHardwareBadge = Boolean(hardwareBadgeLabel && hardwareBadgeLabel.toLowerCase() !== currentCapabilityLabel.toLowerCase());
  const activeProviderName = providerConfig?.provider_id === 'llamacpp-builtin'
    ? 'Built-in llama.cpp'
    : providerLabel({ provider_id: providerConfig?.provider_id, name: providerConfig?.name }, providerCatalog);
  const providerIsExternal = Boolean(providerConfig?.model && providerConfig?.provider_id && providerConfig.provider_id !== 'llamacpp-builtin');

  const isLoading = loadingStatus || loadingModels || loadingEngines || loadingCatalog || loadingProviders;
  const isBusy = Boolean(switchingEngine) || Boolean(installingEngine);

  // Tab badges
  const tabBadges = {
    library:   models.length > 0 ? models.length : null,
    providers: providerProfiles.length > 0 ? providerProfiles.length : null,
    audio:     null,
    runtime:   null,
  };

  // Filter models by search query (used in library tab only — HF search is inline)
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase();
    return models.filter(m =>
      (m.name || m.filename || '').toLowerCase().includes(q) ||
      (m.architecture || '').toLowerCase().includes(q)
    );
  }, [models, searchQuery]);

  const handleRefresh = () => {
    clearEngineActionMessages();
    setInstallJob(null);
    loadStatus();
    loadModelList();
    loadEngineData({ clearActions: true });
    loadEngineCatalog(true);
    loadProviderData();
  };

  return (
    <div className="flex h-full w-full flex-col bg-white text-gray-950 dark:bg-gray-900 dark:text-gray-100 midnight:bg-slate-950 midnight:text-slate-100 font-sans">
      <ConfirmDeleteDialog
        model={deleteConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200/80 bg-white dark:border-gray-800/80 dark:bg-gray-900 midnight:border-slate-800/80 midnight:bg-slate-950">
        <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-8">

          {/* Title row */}
          <div className="flex items-center justify-between gap-4 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                <Cpu className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100 leading-none">Models</h1>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  {providerIsExternal ? activeProviderName : isReady ? serverStatus?.model || 'Ready' : 'No model loaded'}
                  {' · '}
                  <StatusDot status={status} />
                  <span className="ml-1">{statusLabel}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Unified search — visible in library + audio tabs */}
              {(activeTab === 'library' || activeTab === 'audio') && (
                <div className="relative hidden sm:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={activeTab === 'library' ? 'Filter local models…' : 'Filter audio models…'}
                    className="w-48 pl-8 pr-8 py-1.5 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-gray-600 dark:focus:border-gray-600 midnight:border-slate-700 midnight:bg-slate-800/60 transition-all"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={handleRefresh}
                disabled={isLoading || isBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:border-slate-800 midnight:bg-slate-900 midnight:text-slate-400 midnight:hover:bg-slate-800 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Tabs row */}
          <div className="flex items-center gap-1 pb-0 -mb-px overflow-x-auto scrollbar-none">
            {TABS.map(tab => (
              <TabButton
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                onClick={setActiveTab}
                badge={tabBadges[tab.id]}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Error banner */}
        {deleteError && (
          <div className="mx-auto max-w-[1200px] px-6 lg:px-8 mt-4">
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/30 dark:bg-red-900/20 dark:text-red-400">
              <TriangleAlert size={14} className="flex-shrink-0" />
              <span className="flex-1">{deleteError}</span>
              <button onClick={() => setDeleteError('')} className="hover:opacity-70"><X size={13} /></button>
            </div>
          </div>
        )}

        <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-8 py-6">

          {/* Active brain — always visible at top */}
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

          {/* ── Tab panels ─────────────────────────────────────────────────── */}
          <div className="mt-6">

            {/* Library tab */}
            {activeTab === 'library' && (
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
            )}

            {/* Providers tab */}
            {activeTab === 'providers' && (
              <ProvidersSection
                catalog={providerCatalog}
                profiles={providerProfiles}
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
            )}

            {/* Audio tab */}
            {activeTab === 'audio' && (
              <AudioModelsSection searchQuery={searchQuery} />
            )}

            {/* Runtime tab */}
            {activeTab === 'runtime' && (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950 p-5">
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
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelsPage;
