// Models/LocalEnginePanel.jsx — the llama.cpp engine that runs downloaded
// language models, managed right above them: which build is in use, and
// (opened) installing, switching or removing builds. Moved here from
// Settings → Runtime.

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, Cpu } from 'lucide-react';
import EngineRuntimeSection from './EngineRuntimeSection.jsx';
import { installApi } from '../CommandCenter/api/installApi.js';

export default function LocalEnginePanel({ controller }) {
  const {
    serverStatus, engineData, engineCatalog, installJob, mlxStatus,
    loadingEngines, loadingCatalog, switchingEngine, installingEngine, removingEngine,
    switchError, switchSuccess, installError, installSuccess, installNotice,
    removeEngineError, removeEngineSuccess, revertSelection,
    pythonInstallJob, pythonBuildError, pythonBuildSuccess,
    loadEngineData, loadEngineCatalog, handleEngineSwitch, handleManagedInstall,
    handleCancelInstall, handleCancelBuild, handleBuildGpuRuntime, handleRemoveManagedEngine,
  } = controller;
  const busy = Boolean(installJob || switchingEngine || installingEngine || removingEngine || pythonInstallJob);
  const [open, setOpen] = useState(false);
  const [readiness, setReadiness] = useState(null);
  const current = engineData?.current || null;
  const expanded = open || busy || (!current && !loadingEngines);

  const loadReadiness = useCallback((refresh = false) => installApi.getReadiness({ refresh })
    .then(setReadiness)
    .catch(() => setReadiness(null)), []);

  useEffect(() => {
    if (expanded && !readiness) loadReadiness();
  }, [expanded, readiness, loadReadiness]);

  const version = current?.version?.tag || (typeof current?.version === 'string' ? current.version : '') || current?.label;
  const summary = current
    ? [version || 'llama.cpp', current.capabilityLabel, current.managed ? 'installed by Asyncat' : 'found on this computer'].filter(Boolean).join(' · ')
    : loadingEngines ? 'Checking…' : 'Not installed: downloaded models need it to run.';

  return (
    <section className="rounded-xl border border-line bg-surface" aria-label="Local engine">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-fg-muted">
          <Cpu className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-fg">Engine · llama.cpp</span>
          <span className="block truncate text-[12px] text-fg-muted">{summary}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-line px-4 py-4">
          <EngineRuntimeSection
            engineData={engineData}
            mlxStatus={mlxStatus}
            engineCatalog={engineCatalog}
            loadingCatalog={loadingCatalog}
            installJob={installJob}
            loading={loadingEngines}
            switchingKey={switchingEngine}
            installingKey={installingEngine}
            removingKey={removingEngine}
            switchError={switchError}
            switchSuccess={switchSuccess}
            installError={installError}
            installSuccess={installSuccess}
            installNotice={installNotice}
            removeError={removeEngineError}
            removeSuccess={removeEngineSuccess}
            revertSelection={revertSelection}
            retryModel={serverStatus?.model || null}
            pythonInstallJob={pythonInstallJob}
            pythonBuildError={pythonBuildError}
            pythonBuildSuccess={pythonBuildSuccess}
            onRescan={loadEngineData}
            onSwitch={handleEngineSwitch}
            onInstall={handleManagedInstall}
            onCancelInstall={handleCancelInstall}
            onCancelBuild={handleCancelBuild}
            onBuildGpuRuntime={handleBuildGpuRuntime}
            onRemoveManagedEngine={handleRemoveManagedEngine}
            onRefreshCatalog={async (refresh = false) => {
              await Promise.all([loadEngineCatalog(refresh), loadReadiness(refresh)]);
            }}
            installReadiness={readiness}
          />
        </div>
      )}
    </section>
  );
}

LocalEnginePanel.propTypes = {
  controller: PropTypes.object.isRequired,
};
