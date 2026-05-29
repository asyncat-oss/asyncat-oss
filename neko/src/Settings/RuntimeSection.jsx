import { useCallback, useEffect, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import EngineRuntimeSection from '../Models/EngineRuntimeSection.jsx';
import RuntimeSetupPanel from '../Models/RuntimeSetupPanel.jsx';
import { useModelsPageController } from '../Models/useModelsPageController.js';
import { installApi } from '../CommandCenter/api/installApi.js';

const RuntimeSection = () => {
  const {
    serverStatus,
    engineData,
    engineCatalog,
    installJob,
    setInstallJob,
    loadingStatus,
    loadingEngines,
    loadingCatalog,
    switchingEngine,
    installingEngine,
    switchError,
    switchSuccess,
    installError,
    installSuccess,
    revertSelection,
    pythonInstallJob,
    pythonBuildError,
    pythonBuildSuccess,
    clearEngineActionMessages,
    loadStatus,
    loadEngineData,
    loadEngineCatalog,
    handleEngineSwitch,
    handleManagedInstall,
    handleBuildGpuRuntime,
  } = useModelsPageController();

  const [installReadiness, setInstallReadiness] = useState(null);
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false);

  const loadInstallReadiness = useCallback(() => (
    installApi.getReadiness()
      .then(setInstallReadiness)
      .catch(() => setInstallReadiness(null))
  ), []);

  useEffect(() => {
    loadInstallReadiness();
  }, [loadInstallReadiness]);

  const refreshRuntime = useCallback(async () => {
    setRuntimeRefreshing(true);
    clearEngineActionMessages();
    setInstallJob(null);
    try {
      await Promise.all([
        loadStatus(),
        loadEngineData({ clearActions: true }),
        loadEngineCatalog(true),
        loadInstallReadiness(),
      ]);
    } finally {
      setRuntimeRefreshing(false);
    }
  }, [clearEngineActionMessages, loadEngineCatalog, loadEngineData, loadInstallReadiness, loadStatus, setInstallJob]);

  const refreshRuntimeCatalog = useCallback(async (refresh = false) => {
    await Promise.all([
      loadEngineCatalog(refresh),
      loadInstallReadiness(),
    ]);
  }, [loadEngineCatalog, loadInstallReadiness]);

  return (
    <div className="font-sora space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 midnight:bg-gray-800 midnight:ring-gray-700">
            <Cpu size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
              Local Runtime
            </h3>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500">
              Select the local chat engine, keep CPU/GPU builds installed side by side, and review runtime tools.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refreshRuntime}
          disabled={runtimeRefreshing || loadingStatus || loadingEngines || loadingCatalog}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 midnight:border-gray-700 midnight:bg-gray-900 midnight:text-gray-200"
        >
          <RefreshCw size={13} className={runtimeRefreshing || loadingStatus || loadingEngines || loadingCatalog ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <RuntimeSetupPanel />

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
        onRefreshCatalog={refreshRuntimeCatalog}
        installReadiness={installReadiness}
      />
    </div>
  );
};

export default RuntimeSection;
