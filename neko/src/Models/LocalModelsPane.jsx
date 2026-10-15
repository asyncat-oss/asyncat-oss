import { CheckCircle2, File, FolderOpen, HardDrive, Image, Play, Plus, Trash2, TriangleAlert } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { LocalModelLogo } from './modelLogos.jsx';
import MlxModelsSection from './MlxModelsSection.jsx';
import { localModelsApi, llamaServerApi, mlxApi } from '../Settings/settingApi.js';
import { Badge, DEFAULT_LOAD_CTX_SIZE, Panel, SectionHeader, getModelContextLimit, getModelLoadCtxError } from './modelPageShared.jsx';

const notifyModelRuntimeUpdated = () => {
  window.dispatchEvent(new CustomEvent('asyncat-model-runtime-updated'));
};

// ── One downloaded model ─────────────────────────────────────────────────────
const ModelCard = ({
  m, serverStatus, status, startingModel, deletingModel, activeMlxModel,
  switchingEngine, installingEngine,
  highlighted,
  modelLoadCtxSizes, modelLoadCtxErrors,
  updateModelLoadCtxSize, commitModelLoadCtxSize,
  handleStart, handleDelete,
  setStartingModel, setServerStatus,
  pollCleanup, loadEngineData,
  setSwitchError
}) => {
  const isLoaded = ((
    serverStatus?.model === m.filename ||
    serverStatus?.modelPath === (m.path || m.filename)
  ) && (serverStatus?.status === 'ready' || status === 'ready'))
    || Boolean(activeMlxModel && m.engineType === 'mlx' && activeMlxModel === m.path);

  const isStarting = startingModel === (m.path || m.filename);
  const isDeleting = deletingModel === m.filename;
  const modelContextLimit = getModelContextLimit(m);
  const modelLoadCtxValue = modelLoadCtxSizes[m.filename] ?? String(Math.min(DEFAULT_LOAD_CTX_SIZE, modelContextLimit));
  const loadCtxError = modelLoadCtxErrors[m.filename] || getModelLoadCtxError(modelLoadCtxValue, modelContextLimit);
  const busy = Boolean(switchingEngine) || Boolean(installingEngine);

  const load = () => {
    if (m.engineType === 'mlx') {
      setStartingModel(m.path);
      mlxApi.start(m.path).then(() => {
        setServerStatus(prev => ({ ...prev, status: 'loading', model: m.name, modelPath: m.path, port: 8766 }));
        notifyModelRuntimeUpdated();
        pollCleanup.current?.();
        pollCleanup.current = mlxApi.pollStatus(
          (snap) => { setServerStatus(snap); notifyModelRuntimeUpdated(); },
          async (snap) => { setServerStatus(snap); pollCleanup.current = null; setStartingModel(null); notifyModelRuntimeUpdated(); await loadEngineData(); },
          async (snap) => { setServerStatus(snap); pollCleanup.current = null; setStartingModel(null); notifyModelRuntimeUpdated(); setSwitchError(snap?.error || 'Failed to load MLX model'); }
        );
      }).catch(err => {
        setStartingModel(null);
        setSwitchError(err.message || 'Failed to start MLX server');
      });
    } else {
      handleStart(m.path || m.filename, modelLoadCtxValue);
    }
  };

  const details = [
    m.engineType === 'gguf' ? 'GGUF' : m.engineType === 'mlx' ? 'MLX' : null,
    m.sizeFormatted,
    m.architecture,
    m.contextLength ? `${Number(m.contextLength).toLocaleString()} ctx max` : null,
  ].filter(Boolean);

  return (
    <div
      id={`model-card-${m.id || m.filename}`}
      className={`flex flex-col gap-3 rounded-xl border px-4 py-3 transition-[border-color,background-color] sm:flex-row sm:items-center ${
        isLoaded ? 'border-accent/35 bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
      } ${highlighted ? 'ring-2 ring-accent/40' : ''}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        {m.isExternal ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface ring-1 ring-inset ring-line">
            <FolderOpen className="h-5 w-5 text-fg-muted" strokeWidth={1.75} />
          </span>
        ) : (
          <LocalModelLogo modelName={m.name || ''} modelFile={m.filename || ''} size="md" />
        )}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] font-medium text-fg" title={m.name || m.filename}>{m.name || m.filename}</span>
            {isLoaded ? <Badge color="blue">Loaded</Badge> : null}
            {m.source === 'huggingface-cache'
              ? <Badge color="gray" title={m.repoId}>Hugging Face cache</Badge>
              : m.isExternal ? <Badge color="gray">Linked file</Badge> : null}
            {m.isMissing ? <Badge color="red">Missing</Badge> : null}
            {m.capabilities?.supportsImageInput ? <Badge color="gray"><Image className="h-3 w-3" />Sees images</Badge> : null}
          </div>
          <p className="mt-0.5 truncate text-[12px] text-fg-muted">{details.join(' · ')}</p>
          {loadCtxError ? <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">{loadCtxError}</p> : null}
        </div>
      </div>

      {/* On a phone the context field gives way so the buttons stay inside the card. */}
      <div className="flex items-center gap-2 sm:shrink-0">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-canvas pl-2.5 pr-1 text-[12px] text-fg-subtle focus-within:border-accent sm:flex-none" title="How much context to load. Larger uses more memory.">
          <span className="sm:hidden">Ctx</span>
          <span className="hidden sm:inline">Context</span>
          <input
            type="number"
            min="512"
            max={modelContextLimit}
            step="1024"
            value={modelLoadCtxValue}
            onChange={(e) => updateModelLoadCtxSize(m.filename, e.target.value)}
            onBlur={() => commitModelLoadCtxSize(m.filename, modelContextLimit)}
            aria-label={`Context to load for ${m.name || m.filename}`}
            className={`w-full min-w-0 bg-transparent text-right sm:w-[4.5rem] font-medium tabular-nums outline-none ${loadCtxError ? 'text-red-600 dark:text-red-400' : 'text-fg'}`}
          />
        </label>
        {isLoaded ? (
          <span className="inline-flex h-8 items-center gap-1.5 px-2 text-[13px] font-medium text-accent">
            <CheckCircle2 className="h-4 w-4" /> Loaded
          </span>
        ) : (
          <Button size="sm" variant="secondary" icon={Play} onClick={load} loading={isStarting} disabled={isDeleting || busy || Boolean(loadCtxError)}>
            {isStarting ? 'Loading' : 'Load'}
          </Button>
        )}
        {m.readOnly ? null : <Button
          size="icon"
          variant="ghost"
          icon={Trash2}
          onClick={() => handleDelete(m)}
          loading={isDeleting}
          disabled={isLoaded || busy}
          aria-label={m.isExternal ? `Remove ${m.name || m.filename} from library` : `Delete ${m.name || m.filename}`}
          title={m.isExternal ? 'Remove from library' : 'Delete model'}
          className="hover:text-red-600 dark:hover:text-red-400"
        />}
      </div>
    </div>
  );
};

// ── Main pane ──────────────────────────────────────────────────────────────────
const LocalModelsPane = ({
  models, loadingModels, serverStatus, status,
  mlxStatus, activeMlxModel = null,
  startingModel, setStartingModel, deletingModel,
  switchingEngine, installingEngine,
  highlightedItem,
  quickLoadPath, setQuickLoadPath,
  modelContextConfig, setServerStatus, pollCleanup,
  loadEngineData, loadProviderData, loadStatus,
  handleAddPath, switchError, switchSuccess, setSwitchError, setSwitchSuccess,
  modelLoadCtxSizes, modelLoadCtxErrors,
  updateModelLoadCtxSize, commitModelLoadCtxSize,
  handleStart, handleDelete
}) => {
  const loadFromPath = async () => {
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
      notifyModelRuntimeUpdated();
      pollCleanup.current?.();
      const api = res.engine === 'mlx' ? mlxApi : llamaServerApi;
      pollCleanup.current = api.pollStatus(
        (snap) => { setServerStatus(snap); notifyModelRuntimeUpdated(); },
        async (snap) => { setServerStatus(snap); pollCleanup.current = null; setStartingModel(null); notifyModelRuntimeUpdated(); await loadEngineData(); await loadProviderData(); },
        async (snap) => { setServerStatus(snap); pollCleanup.current = null; setStartingModel(null); notifyModelRuntimeUpdated(); setSwitchError(snap?.error || `Failed to load ${res.engine?.toUpperCase()} model`); }
      );
    } catch (err) {
      setStartingModel(null);
      setSwitchError(err.message || 'Failed to start model server');
    }
  };

  const chooseFile = async () => {
    setSwitchError('');
    const result = await window.electronAPI.openFilesDialog({
      title: 'Choose a local model file',
      buttonLabel: 'Choose model',
      multiSelections: false,
      defaultPath: quickLoadPath.trim() || undefined,
      filters: [
        { name: 'Local model files', extensions: ['gguf', 'bin'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (!result?.canceled && result?.filePaths?.[0]) setQuickLoadPath(result.filePaths[0]);
  };

  const chooseFolder = async () => {
    setSwitchError('');
    const result = await window.electronAPI.openDirectory({
      title: 'Choose an MLX model folder',
      buttonLabel: 'Choose folder',
      defaultPath: quickLoadPath.trim() || undefined,
    });
    if (!result?.canceled && result?.filePaths?.[0]) setQuickLoadPath(result.filePaths[0]);
  };

  const hasPath = Boolean(quickLoadPath.trim());

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-3">
        <SectionHeader
          title="Your downloaded models"
          description="Models on this computer, including ones in your Hugging Face cache. Loading one also makes it the default for new chats."
          action={models.length ? <Badge color="gray">{models.length} model{models.length === 1 ? '' : 's'}</Badge> : null}
        />

        {loadingModels ? (
          <div className="space-y-2">
            {[0, 1].map(i => <div key={i} className="h-[66px] animate-pulse rounded-xl bg-hover" />)}
          </div>
        ) : models.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
            <HardDrive className="h-7 w-7 text-fg-subtle" strokeWidth={1.5} />
            <p className="mt-3 text-[14px] font-medium text-fg">No downloaded models yet</p>
            <p className="mt-1 max-w-xs text-[13px] leading-5 text-fg-muted">Search Hugging Face above to download one, or load a file you already have below.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {models.map(m => (
              <ModelCard
                key={m.filename}
                m={m}
                serverStatus={serverStatus}
                status={status}
                startingModel={startingModel}
                deletingModel={deletingModel}
                activeMlxModel={activeMlxModel}
                switchingEngine={switchingEngine}
                installingEngine={installingEngine}
                highlighted={highlightedItem?.type === 'model' && String(highlightedItem.id) === String(m.id || m.filename)}
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
                setSwitchError={setSwitchError}
              />
            ))}
          </div>
        )}
      </div>

      <Panel className="p-4">
        <p className="text-[13px] font-medium text-fg">Load a model from a file or folder</p>
        <p className="mt-0.5 text-[12px] text-fg-subtle">A .gguf file, or an MLX model folder, anywhere on this computer.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-line-strong bg-canvas px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 sm:flex-1">
            <FolderOpen className="h-4 w-4 shrink-0 text-fg-subtle" />
            <input
              type="text"
              value={quickLoadPath}
              onChange={(e) => setQuickLoadPath(e.target.value)}
              placeholder="/path/to/model.gguf"
              aria-label="Model path"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-fg outline-none placeholder:text-fg-subtle"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:flex-nowrap">
            {window?.electronAPI?.openFilesDialog ? <Button size="md" variant="ghost" icon={File} onClick={chooseFile}>File</Button> : null}
            {window?.electronAPI?.openDirectory ? <Button size="md" variant="ghost" icon={FolderOpen} onClick={chooseFolder}>Folder</Button> : null}
            <Button
              size="md"
              variant="secondary"
              icon={Plus}
              onClick={handleAddPath}
              loading={switchingEngine === 'adding_path'}
              disabled={!hasPath || Boolean(switchingEngine)}
              title="Keep this path in your library"
            >
              Add to library
            </Button>
            <Button
              size="md"
              variant="primary"
              icon={Play}
              onClick={loadFromPath}
              loading={Boolean(startingModel) && startingModel === quickLoadPath.trim()}
              disabled={!hasPath || Boolean(startingModel) || Boolean(switchingEngine) || Boolean(installingEngine)}
            >
              Load
            </Button>
          </div>
        </div>

        {switchError ? (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-400">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {switchError}
          </p>
        ) : null}
        {switchSuccess ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {switchSuccess}
          </p>
        ) : null}
      </Panel>

      {(mlxStatus?.available && (
        mlxStatus?.mlxAvailable === false
        || serverStatus?.port === 8766
        || (serverStatus?.status === 'loading' && startingModel && !startingModel.toLowerCase().endsWith('.gguf') && !startingModel.toLowerCase().endsWith('.bin'))
      )) && (
        <Panel className="p-5">
          <MlxModelsSection
            globalServerStatus={serverStatus}
            onMlxStatusChange={setServerStatus}
            onMlxStopRequest={loadStatus}
            onMlxRuntimeChange={loadStatus}
          />
        </Panel>
      )}
    </div>
  );
};

export default LocalModelsPane;
