import { RefreshCw, Play, Trash2, Box, Cpu, TriangleAlert, ChevronDown, ChevronUp, CheckCircle2, Plus, FolderOpen } from 'lucide-react';
import LocalModelsSection from './LocalModelsSection.jsx';
import MlxModelsSection from './MlxModelsSection.jsx';
import { localModelsApi, llamaServerApi, mlxApi } from '../Settings/settingApi.js';
import { Badge, DEFAULT_LOAD_CTX_SIZE, Panel, SectionHeader, getModelContextLimit, getModelLoadCtxError } from './modelPageShared.jsx';

// ── Model card ─────────────────────────────────────────────────────────────────
const ModelCard = ({
  m, serverStatus, status, startingModel, deletingModel,
  switchingEngine, installingEngine,
  modelLoadCtxSizes, modelLoadCtxErrors,
  updateModelLoadCtxSize, commitModelLoadCtxSize,
  handleStart, handleDelete,
  setStartingModel, setServerStatus,
  pollCleanup, loadEngineData, loadProviderData,
  setSwitchError
}) => {
  const isLoaded = (
    serverStatus?.model === m.filename ||
    serverStatus?.modelPath === (m.path || m.filename)
  ) && (serverStatus?.status === 'ready' || status === 'ready');

  const isStarting = startingModel === (m.path || m.filename);
  const isDeleting = deletingModel === m.filename;
  const modelContextLimit = getModelContextLimit(m);
  const modelLoadCtxValue = modelLoadCtxSizes[m.filename] ?? String(Math.min(DEFAULT_LOAD_CTX_SIZE, modelContextLimit));
  const loadCtxError = modelLoadCtxErrors[m.filename] || getModelLoadCtxError(modelLoadCtxValue, modelContextLimit);

  return (
    <div className={`group relative flex flex-col rounded-2xl border bg-white transition-all duration-200 dark:bg-gray-900 midnight:bg-slate-900
      ${isLoaded
        ? 'border-gray-300 dark:border-gray-600 midnight:border-slate-600'
        : 'border-gray-100 dark:border-gray-800 midnight:border-slate-800 hover:border-gray-200 dark:hover:border-gray-700 midnight:hover:border-slate-700 hover:shadow-sm'}`}
    >
      <div className="px-5 pt-5 pb-4 flex-1">
        {/* Top row: icon + name */}
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
            isLoaded
              ? 'bg-gray-900 text-white dark:bg-gray-600 midnight:bg-slate-700'
              : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400 midnight:bg-slate-800 midnight:text-slate-400'
          }`}>
            {m.isExternal ? <FolderOpen className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100 truncate" title={m.name || m.filename}>
                {m.name || m.filename}
              </h3>
              {isLoaded && (
                <span className="flex h-2.5 w-2.5 relative flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
              )}
            </div>

            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {m.engineType === 'gguf' && <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 midnight:text-slate-500">GGUF</span>}
              {m.engineType === 'mlx' && <span className="text-[10px] font-medium text-amber-500 dark:text-amber-400">MLX</span>}
              {m.isExternal && <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">External</span>}
              {m.isMissing && <span className="text-[10px] font-medium text-red-500">Missing</span>}
              {m.sizeFormatted && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">{m.sizeFormatted}</span>
              )}
              {m.architecture && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">{m.architecture}</span>
              )}
            </div>
          </div>
        </div>

        {/* Context info */}
        <div className="mt-4 flex items-center gap-6 text-xs">
          <div>
            <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-500">Context</span>
            <span className="ml-1.5 font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">
              {m.contextLength ? `${Number(m.contextLength).toLocaleString()} ctx` : 'Unknown'}
            </span>
          </div>
          <label className="flex items-center gap-1.5">
            <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-500">Load</span>
            <div className="flex items-center">
              <input
                type="number"
                min="512"
                max={modelContextLimit}
                step="1024"
                value={modelLoadCtxValue}
                onChange={(e) => updateModelLoadCtxSize(m.filename, e.target.value)}
                onBlur={() => commitModelLoadCtxSize(m.filename, modelContextLimit)}
                className={`w-20 bg-transparent text-xs font-medium outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                  loadCtxError
                    ? 'text-red-500'
                    : 'text-gray-700 dark:text-gray-300 midnight:text-slate-300'
                }`}
              />
              <div className="flex flex-col flex-shrink-0 ml-0.5">
                <button
                  type="button" tabIndex={-1}
                  onClick={() => updateModelLoadCtxSize(m.filename, String(Math.min(Number(modelLoadCtxValue) + 1024, modelContextLimit)))}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 leading-none"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  type="button" tabIndex={-1}
                  onClick={() => updateModelLoadCtxSize(m.filename, String(Math.max(Number(modelLoadCtxValue) - 1024, 512)))}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 leading-none"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          </label>
        </div>

        {loadCtxError && (
          <p className="mt-2 text-[11px] text-red-500">{loadCtxError}</p>
        )}
      </div>

      {/* Action bar */}
      <div className="px-5 py-3 border-t border-gray-50 dark:border-gray-800 midnight:border-slate-800 flex items-center gap-2">
        <button
          onClick={() => {
            if (m.engineType === 'mlx') {
              setStartingModel(m.path);
              mlxApi.start(m.path).then(() => {
                setServerStatus(prev => ({ ...prev, status: 'loading', model: m.name, modelPath: m.path, port: 8766 }));
                pollCleanup.current?.();
                pollCleanup.current = mlxApi.pollStatus(
                  (snap) => setServerStatus(snap),
                  async (snap) => { setServerStatus(snap); pollCleanup.current = null; setStartingModel(null); await loadEngineData(); },
                  async (snap) => { setServerStatus(snap); pollCleanup.current = null; setStartingModel(null); setSwitchError(snap?.error || 'Failed to load MLX model'); }
                );
              }).catch(err => {
                setStartingModel(null);
                setSwitchError(err.message || 'Failed to start MLX server');
              });
            } else {
              handleStart(m.path || m.filename, modelLoadCtxValue);
            }
          }}
          disabled={isStarting || isDeleting || isLoaded || Boolean(switchingEngine) || Boolean(installingEngine)}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all disabled:opacity-40
            ${isLoaded
              ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 midnight:bg-green-950/30 midnight:text-green-400'
              : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 midnight:bg-slate-100 midnight:text-slate-900 midnight:hover:bg-slate-200'}`}
        >
          {isStarting ? <RefreshCw className="w-4 h-4 animate-spin" /> : isLoaded ? <CheckCircle2 className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isStarting ? 'Loading...' : isLoaded ? 'Active' : 'Load'}
        </button>

        <button
          onClick={() => handleDelete(m)}
          disabled={isDeleting || isLoaded || Boolean(switchingEngine) || Boolean(installingEngine)}
          className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-30"
          title={m.isExternal ? "Remove from library" : "Delete model"}
        >
          {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

// ── Main pane ──────────────────────────────────────────────────────────────────
const LocalModelsPane = ({
  models, loadingModels, serverStatus, status,
  startingModel, setStartingModel, deletingModel,
  switchingEngine, installingEngine,
  quickLoadPath, setQuickLoadPath,
  modelContextConfig, setServerStatus, pollCleanup,
  loadEngineData, loadProviderData, loadStatus, loadModelList,
  handleAddPath, switchError, switchSuccess, setSwitchError, setSwitchSuccess,
  modelLoadCtxSizes, modelLoadCtxErrors,
  updateModelLoadCtxSize, commitModelLoadCtxSize,
  handleStart, handleDelete
}) => (
  <div className="flex flex-col gap-6">
    {/* Add Model — HF search + custom URL */}
    <div>
      <SectionHeader
        title="Add Model"
        description="Search HuggingFace or paste a URL to download GGUF models"
      />
      <Panel className="mt-3 p-5">
        <LocalModelsSection onRefresh={loadModelList} />
      </Panel>
    </div>

    {/* From Disk loader */}
    <Panel className="p-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
        <div className="flex-1 w-full">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400 mb-2">
            Load from path
          </label>
          <div className="relative">
            <FolderOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={quickLoadPath}
              onChange={(e) => setQuickLoadPath(e.target.value)}
              placeholder="Path to .gguf file or MLX directory..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600 midnight:border-gray-800/80 midnight:bg-gray-900/50"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={async () => {
              const p = quickLoadPath.trim();
              if (!p) return;
              setStartingModel(p);
              setSwitchError('');
              setSwitchSuccess('');
              try {
                const ctxSize = modelContextConfig?.ctx_size || 4096;
                const res = await localModelsApi.autoStart(p, ctxSize);
                setServerStatus(prev => ({
                  ...prev, status: 'loading',
                  model: p.split(/[\\/]/).pop(), modelPath: p,
                  port: res.engine === 'mlx' ? 8766 : 8765
                }));
                pollCleanup.current?.();
                const api = res.engine === 'mlx' ? mlxApi : llamaServerApi;
                pollCleanup.current = api.pollStatus(
                  (snap) => setServerStatus(snap),
                  async (snap) => { setServerStatus(snap); pollCleanup.current = null; setStartingModel(null); await loadEngineData(); await loadProviderData(); },
                  async (snap) => { setServerStatus(snap); pollCleanup.current = null; setStartingModel(null); setSwitchError(snap?.error || `Failed to load ${res.engine?.toUpperCase()} model`); }
                );
              } catch (err) {
                setStartingModel(null);
                setSwitchError(err.message || 'Failed to start model server');
              }
            }}
            disabled={!quickLoadPath.trim() || startingModel || Boolean(switchingEngine) || Boolean(installingEngine)}
            className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 midnight:bg-slate-100 midnight:text-slate-900 midnight:hover:bg-slate-200 transition-all"
          >
            {startingModel ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            {startingModel ? 'Starting...' : 'Load'}
          </button>

          <button
            onClick={handleAddPath}
            disabled={!quickLoadPath.trim() || Boolean(switchingEngine)}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 midnight:border-slate-700 midnight:text-slate-400 transition-all"
            title="Save this path to your library permanently"
          >
            {switchingEngine === 'adding_path' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
      </div>

      {switchError && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
          <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0" />
          {switchError}
        </div>
      )}

      {switchSuccess && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          {switchSuccess}
        </div>
      )}
    </Panel>

    {/* Library header */}
    <div className="flex items-center justify-between">
      <SectionHeader title="Library" />
      {models.length > 0 && <Badge color="gray">{models.length} model{models.length !== 1 ? 's' : ''}</Badge>}
    </div>

    {/* Model grid */}
    {loadingModels ? (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map(i => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800/50 midnight:bg-slate-800/50" />
        ))}
      </div>
    ) : models.length === 0 ? (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 midnight:border-slate-800 px-4 py-12 text-center">
        <Box className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Your library is empty</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs">
          Search above to find and download GGUF models from HuggingFace.
        </p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {models.map(m => (
          <ModelCard
            key={m.filename}
            m={m}
            serverStatus={serverStatus}
            status={status}
            startingModel={startingModel}
            deletingModel={deletingModel}
            switchingEngine={switchingEngine}
            installingEngine={installingEngine}
            modelLoadCtxSizes={modelLoadCtxSizes}
            modelLoadCtxErrors={modelLoadCtxErrors}
            updateModelLoadCtxSize={updateModelLoadCtxSize}
            commitModelLoadCtxSize={commitModelLoadCtxSize}
            handleStart={handleStart}
            handleDelete={handleDelete}
            setStartingModel={setStartingModel}
            setServerStatus={setServerStatus}
            pollCleanup={pollCleanup}
            loadEngineData={loadEngineData}
            loadProviderData={loadProviderData}
            setSwitchError={setSwitchError}
          />
        ))}
      </div>
    )}

    {/* MLX active panel */}
    {(serverStatus?.port === 8766 || (serverStatus?.status === 'loading' && startingModel && !startingModel.toLowerCase().endsWith('.gguf') && !startingModel.toLowerCase().endsWith('.bin'))) && (
      <Panel className="p-5">
        <MlxModelsSection
          globalServerStatus={serverStatus}
          onMlxStatusChange={setServerStatus}
          onMlxStopRequest={loadStatus}
        />
      </Panel>
    )}
  </div>
);

export default LocalModelsPane;
