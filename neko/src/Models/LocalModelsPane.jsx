import { RefreshCw, Play, Trash2, Box, Cpu, TriangleAlert, ChevronDown, ChevronUp, CheckCircle2, Plus, FolderOpen } from 'lucide-react';
import LocalModelsSection from './LocalModelsSection.jsx';
import MlxModelsSection from './MlxModelsSection.jsx';
import { localModelsApi, llamaServerApi, mlxApi } from '../Settings/settingApi.js';
import { Badge, DEFAULT_LOAD_CTX_SIZE, Panel, SectionHeader, getModelContextLimit, getModelLoadCtxError } from './modelPageShared.jsx';

const LocalModelsPane = ({
  models,
  loadingModels,
  serverStatus,
  status,
  startingModel,
  setStartingModel,
  deletingModel,
  switchingEngine,
  installingEngine,
  quickLoadPath,
  setQuickLoadPath,
  modelContextConfig,
  setServerStatus,
  pollCleanup,
  loadEngineData,
  loadProviderData,
  loadStatus,
  loadModelList,
  handleAddPath,
  switchError,
  switchSuccess,
  setSwitchError,
  setSwitchSuccess,
  modelLoadCtxSizes,
  modelLoadCtxErrors,
  updateModelLoadCtxSize,
  commitModelLoadCtxSize,
  handleStart,
  handleDelete
}) => (
  <div className="flex flex-col gap-6">

                {/* Models: Library + Download combined */}
                <div>
                  <SectionHeader
                    title="Local Models"
                    action={models.length > 0 ? <Badge color="gray">{models.length} Models</Badge> : null}
                  />

                  {/* Add Model panel — HF search + custom URL, always visible */}
                  <Panel className="mt-4 p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 midnight:bg-slate-800 midnight:text-slate-300">
                        <Plus className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Add Model</h3>
                      </div>
                    </div>
                    <LocalModelsSection onRefresh={loadModelList} />
                  </Panel>

                  {/* Unified Path Loader */}
                  <Panel className="mt-5 p-5">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="flex-1 w-full">
                        <div className="mb-3 flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 midnight:bg-slate-800 midnight:text-slate-300">
                            <FolderOpen className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">From Disk</h3>
                          </div>
                        </div>
                        <div className="relative group">
                          <input
                            type="text"
                            value={quickLoadPath}
                            onChange={(e) => setQuickLoadPath(e.target.value)}
                            placeholder="Enter absolute path to .gguf file or MLX directory..."
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600 dark:focus:ring-gray-600 midnight:border-gray-800/80 midnight:bg-gray-900/50 midnight:focus:border-gray-700 midnight:focus:ring-gray-700"
                          />
                          <FolderOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-colors group-focus-within:text-gray-600 dark:group-focus-within:text-gray-300" />
                        </div>
                      </div>
                      <div className="flex-shrink-0 w-full sm:w-auto self-end">
                        <div className="flex flex-wrap items-center gap-2">
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
                                  ...prev, 
                                  status: 'loading', 
                                  model: p.split(/[\\/]/).pop(), 
                                  modelPath: p,
                                  port: res.engine === 'mlx' ? 8766 : 8765 
                                }));

                                // Polling logic based on detected engine
                                pollCleanup.current?.();
                                const api = res.engine === 'mlx' ? mlxApi : llamaServerApi;
                                
                                pollCleanup.current = api.pollStatus(
                                  (snap) => setServerStatus(snap),
                                  async (snap) => {
                                    setServerStatus(snap);
                                    pollCleanup.current = null;
                                    setStartingModel(null);
                                    await loadEngineData();
                                    await loadProviderData();
                                  },
                                  async (snap) => {
                                    setServerStatus(snap);
                                    pollCleanup.current = null;
                                    setStartingModel(null);
                                    setSwitchError(snap?.error || `Failed to load ${res.engine?.toUpperCase()} model`);
                                  }
                                );
                              } catch (err) {
                                setStartingModel(null);
                                setSwitchError(err.message || 'Failed to start model server');
                              }
                            }}
                            disabled={!quickLoadPath.trim() || startingModel || Boolean(switchingEngine) || Boolean(installingEngine)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 midnight:bg-slate-100 midnight:text-slate-900 midnight:hover:bg-slate-200"
                          >
                            {startingModel && <RefreshCw className="w-4 h-4 animate-spin" />}
                            {startingModel ? 'Starting...' : 'Load Model'}
                          </button>
                          
                          <button
                            onClick={handleAddPath}
                            disabled={!quickLoadPath.trim() || Boolean(switchingEngine)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 midnight:border-slate-700 midnight:text-slate-400"
                            title="Save this path to your library permanently"
                          >
                            {switchingEngine === 'adding_path' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Add to Library
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {switchError && (
                      <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                        <TriangleAlert className="w-4 h-4 flex-shrink-0" />
                        {switchError}
                      </div>
                    )}
                    
                    {switchSuccess && (
                      <div className="mt-3 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 flex items-center gap-2 text-xs text-green-700 dark:text-green-300">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        {switchSuccess}
                      </div>
                    )}
                    
                  </Panel>

                  <div className="mt-6">
                    <SectionHeader
                      title="Library"
                    />
                  </div>

                  {loadingModels ? (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[1, 2].map(i => (
                        <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800/50 midnight:bg-slate-800/50" />
                      ))}
                    </div>
                  ) : models.length === 0 ? (
                    <div className="mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white/70 px-4 py-12 dark:border-gray-800 dark:bg-gray-900/50 midnight:border-slate-800 midnight:bg-slate-900/50">
                      <div className="p-3 bg-white dark:bg-gray-800 midnight:bg-slate-800 rounded-full shadow-sm mb-3">
                        <Box className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-gray-600 dark:text-gray-300 midnight:text-slate-300 font-medium">Your library is empty</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400 mt-1 max-w-sm text-center">
                        Use the search above to find and download GGUF models from HuggingFace.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {models.map(m => {
                        const isLoaded = (serverStatus?.model === m.filename || serverStatus?.modelPath === (m.path || m.filename)) && (serverStatus?.status === 'ready' || status === 'ready');
                        const isStarting = startingModel === (m.path || m.filename);
                        const isDeleting = deletingModel === m.filename;
                        const modelContextLimit = getModelContextLimit(m);
                        const modelLoadCtxValue = modelLoadCtxSizes[m.filename] ?? String(Math.min(DEFAULT_LOAD_CTX_SIZE, modelContextLimit));
                        const loadCtxError = modelLoadCtxErrors[m.filename] || getModelLoadCtxError(modelLoadCtxValue, modelContextLimit);

                        return (
                          <div
                            key={m.filename}
                            className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white transition-all duration-200 hover:shadow-md dark:bg-gray-800 midnight:bg-slate-900
                              ${isLoaded ? 'border-gray-400 dark:border-gray-500 midnight:border-slate-600 ring-1 ring-gray-400/30 dark:ring-gray-500/30 midnight:ring-slate-500/20 shadow-sm' : 'border-gray-200 dark:border-gray-700 midnight:border-slate-800/80 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-slate-700'}`}
                          >
                            <div className={`absolute inset-x-0 top-0 h-1 ${isLoaded ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                            <div className="p-5 flex-1">
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isLoaded ? 'bg-gray-700 text-white dark:bg-gray-600 midnight:bg-slate-800' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 midnight:bg-slate-800/50 midnight:text-slate-400'}`}>
                                    {m.isExternal ? <FolderOpen className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
                                  </div>
                                  <div className="min-w-0">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-slate-100 truncate" title={m.name || m.filename}>
                                      {m.name || m.filename}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      {m.engineType === 'gguf' && <Badge color="gray">GGUF</Badge>}
                                      {m.engineType === 'mlx' && <Badge color="amber">MLX</Badge>}
                                      {m.isExternal && <Badge color="gray">External</Badge>}
                                      {m.isMissing && <Badge color="red">Missing Path</Badge>}
                                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400 bg-gray-100 dark:bg-gray-900/50 midnight:bg-slate-800/50 px-2 py-0.5 rounded">
                                        {m.sizeFormatted}
                                      </span>
                                      {m.architecture && (
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400 bg-gray-100 dark:bg-gray-900/50 midnight:bg-slate-800/50 px-2 py-0.5 rounded">
                                          {m.architecture}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {isLoaded && (
                                  <span className="flex h-3 w-3 relative flex-shrink-0 mt-1">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                                <div className="rounded-xl bg-gray-50 dark:bg-gray-900/60 midnight:bg-slate-950/60 px-3 py-2 border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
                                  <div className="text-[11px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 midnight:text-slate-500">Model context</div>
                                  <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200 midnight:text-slate-100">
                                    {m.contextLength ? `${Number(m.contextLength).toLocaleString()} ctx` : 'Unknown'}
                                  </div>
                                </div>
                                <label className="rounded-xl bg-gray-50 dark:bg-gray-900/60 midnight:bg-slate-950/60 px-3 py-2 border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
                                  <span className="block text-[11px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 midnight:text-slate-500">Load context</span>
                                  <div className="mt-1 flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="512"
                                      max={modelContextLimit}
                                      step="1024"
                                      value={modelLoadCtxValue}
                                      onChange={(e) => updateModelLoadCtxSize(m.filename, e.target.value)}
                                      onBlur={() => commitModelLoadCtxSize(m.filename, modelContextLimit)}
                                      className={`w-full min-w-0 bg-transparent text-sm font-medium outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                        loadCtxError
                                          ? 'text-red-700 dark:text-red-400 midnight:text-red-400'
                                          : 'text-gray-800 dark:text-gray-200 midnight:text-slate-100'
                                      }`}
                                    />
                                    <div className="flex flex-col flex-shrink-0">
                                      <button
                                        type="button"
                                        tabIndex={-1}
                                        onClick={() => updateModelLoadCtxSize(m.filename, String(Math.min(Number(modelLoadCtxValue) + 1024, modelContextLimit)))}
                                        className="flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-slate-200 transition-colors"
                                      >
                                        <ChevronUp className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        tabIndex={-1}
                                        onClick={() => updateModelLoadCtxSize(m.filename, String(Math.max(Number(modelLoadCtxValue) - 1024, 512)))}
                                        className="flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-slate-200 transition-colors"
                                      >
                                        <ChevronDown className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </label>
                                <div className="rounded-xl bg-gray-50 dark:bg-gray-900/60 midnight:bg-slate-950/60 px-3 py-2 border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
                                  <div className="text-[11px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 midnight:text-slate-500">Status</div>
                                  <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200 midnight:text-slate-100">
                                    {isLoaded ? 'Loaded now' : 'Ready to load'}
                                  </div>
                                </div>
                              </div>
                              {loadCtxError && (
                                <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
                                  {loadCtxError}
                                </p>
                              )}
                            </div>

                            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 border-t border-gray-100 dark:border-gray-700/50 midnight:border-slate-800/50 flex items-center justify-between gap-2">
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
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50
                                  ${isLoaded 
                                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-200 dark:shadow-none' 
                                    : 'bg-gray-800 hover:bg-gray-700 text-white dark:bg-gray-100 dark:hover:bg-gray-200 dark:text-gray-900 midnight:bg-slate-100 midnight:hover:bg-slate-200 midnight:text-slate-900'}`}
                              >
                                {isStarting ? <RefreshCw className="w-4 h-4 animate-spin" /> : isLoaded ? <CheckCircle2 className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                                {isStarting ? 'Loading...' : isLoaded ? 'Active' : 'Load Model'}
                              </button>

                              <button
                                onClick={() => handleDelete(m)}
                                disabled={isDeleting || isLoaded || Boolean(switchingEngine) || Boolean(installingEngine)}
                                className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                                title={m.isExternal ? "Remove from library" : "Delete model"}
                              >
                                {isDeleting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                  {/* MLX Models — Only show when active or loading an MLX model */}
                  {(serverStatus?.port === 8766 || (serverStatus?.status === 'loading' && startingModel && !startingModel.toLowerCase().endsWith('.gguf') && !startingModel.toLowerCase().endsWith('.bin'))) && (
                    <Panel className="order-2 p-5">
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
