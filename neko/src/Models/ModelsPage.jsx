import { RefreshCw, Cpu, TriangleAlert, X, SlidersHorizontal, ChevronDown } from 'lucide-react';
import ActiveBrainPanel from './ActiveBrainPanel.jsx';
import EngineRuntimeSection from './EngineRuntimeSection.jsx';
import ProvidersSection from './ProvidersSection.jsx';
import LocalModelsPane from './LocalModelsPane.jsx';
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx';
import { Badge, STATUS_META, conciseHardwareSummary, providerLabel } from './modelPageShared.jsx';
import { useModelsPageController } from './useModelsPageController.js';

const ModelsPage = () => {
  const {
    modelContextConfig,
    serverStatus,
    setServerStatus,
    models,
    engineData,
    engineCatalog,
    installJob,
    setInstallJob,
    loadingModels,
    loadingStatus,
    loadingEngines,
    loadingCatalog,
    startingModel,
    setStartingModel,
    stopping,
    deletingModel,
    switchingEngine,
    installingEngine,
    switchError,
    setSwitchError,
    switchSuccess,
    setSwitchSuccess,
    installError,
    installSuccess,
    revertSelection,
    quickLoadPath,
    setQuickLoadPath,
    pythonInstallJob,
    pythonBuildError,
    pythonBuildSuccess,
    modelLoadCtxSizes,
    modelLoadCtxErrors,
    providerCatalog,
    providerProfiles,
    providerConfig,
    loadingProviders,
    providerAction,
    providerError,
    deleteConfirm,
    setDeleteConfirm,
    deleteError,
    setDeleteError,
    pollCleanup,
    clearEngineActionMessages,
    updateModelLoadCtxSize,
    commitModelLoadCtxSize,
    loadStatus,
    loadModelList,
    loadEngineData,
    loadEngineCatalog,
    loadProviderData,
    handleProviderSave,
    handleProviderDelete,
    handleProviderTest,
    handleProviderActivate,
    handleProviderDeactivate,
    handleLoadProviderModels,
    handleStart,
    handleStop,
    handleDelete,
    confirmDelete,
    handleAddPath,
    handleEngineSwitch,
    handleManagedInstall,
    handleBuildGpuRuntime
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
  const showHardwareBadge = Boolean(
    hardwareBadgeLabel
    && hardwareBadgeLabel.toLowerCase() !== currentCapabilityLabel.toLowerCase()
  );
  const activeProviderName = providerConfig?.provider_id === 'llamacpp-builtin'
    ? 'Built-in llama.cpp'
    : providerLabel({ provider_id: providerConfig?.provider_id, name: providerConfig?.name }, providerCatalog);
  const providerIsExternal = Boolean(
    providerConfig?.model
    && providerConfig?.provider_id
    && providerConfig.provider_id !== 'llamacpp-builtin'
  );
  const brainMode = providerIsExternal ? 'Provider' : isReady ? 'Local model' : 'Not loaded';

  return (
    <div className="flex h-full w-full bg-white text-gray-950 dark:bg-gray-900 dark:text-gray-100 midnight:bg-slate-950 midnight:text-slate-100 font-sans">
      <ConfirmDeleteDialog
        model={deleteConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-gray-200/80 bg-white px-6 py-5 dark:border-gray-800/80 dark:bg-gray-900 midnight:border-slate-800/80 midnight:bg-slate-950 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 midnight:border-slate-800 midnight:bg-slate-900 midnight:text-slate-300">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100">
                    Models
                  </h1>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                    Choose what Asyncat uses to think.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={providerIsExternal ? 'gray' : isReady ? 'green' : statusColor}>{brainMode}</Badge>
                {currentCapabilityLabel && <Badge color="gray">{currentCapabilityLabel}</Badge>}
                <button
                  onClick={() => {
                    clearEngineActionMessages();
                    setInstallJob(null);
                    loadStatus();
                    loadModelList();
                    loadEngineData({ clearActions: true });
                    loadEngineCatalog(true);
                    loadProviderData();
                  }}
                  disabled={loadingStatus || loadingModels || loadingEngines || loadingCatalog || loadingProviders || Boolean(switchingEngine) || Boolean(installingEngine)}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 midnight:border-slate-800 midnight:bg-slate-900 midnight:text-slate-300 midnight:hover:bg-slate-800"
                >
                  <RefreshCw className={`w-4 h-4 ${(loadingStatus || loadingModels || loadingEngines || loadingCatalog || loadingProviders) ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto w-full">
          {deleteError && (
            <div className="mx-6 mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/30 dark:bg-red-900/20 dark:text-red-400 lg:mx-8">
              <TriangleAlert size={15} className="flex-shrink-0" />
              <span className="flex-1">{deleteError}</span>
              <button onClick={() => setDeleteError('')} className="flex-shrink-0 hover:opacity-70 transition-opacity"><X size={14} /></button>
            </div>
          )}
          <div className="mx-auto w-full max-w-[1180px] px-6 py-6 lg:px-8">
            <div className="space-y-6">
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

              <div className="min-w-0 space-y-8">
                <LocalModelsPane
                  models={models}
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

                <details className="group rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 midnight:bg-slate-800 midnight:text-slate-400">
                        <SlidersHorizontal className="h-4 w-4" />
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold text-gray-950 dark:text-white midnight:text-slate-100">Runtime</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">{engineData?.current?.capabilityLabel || 'Engine setup'}</p>
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-gray-400 transition group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-gray-100 p-5 dark:border-gray-800 midnight:border-slate-800">
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
                </details>

            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelsPage;
