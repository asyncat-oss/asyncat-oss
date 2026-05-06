import { useState, useEffect, useRef } from 'react';
import { llamaServerApi, localModelsApi, aiProviderApi, mlxApi } from '../Settings/settingApi.js';
import { useModelConfig } from '../CommandCenter/hooks/useModelConfig.js';
import { INSTALL_PROFILE_LABELS, DEFAULT_LOAD_CTX_SIZE, MAX_LOAD_CTX_SIZE, normalizeLoadCtxSize, getModelContextLimit, getModelLoadCtxError, loadSavedModelContextSizes, saveModelContextSizes } from './modelPageShared.jsx';

export const useModelsPageController = () => {
  const { config: modelContextConfig, setConfig: setModelContextConfig } = useModelConfig();
  const [serverStatus, setServerStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [engineData, setEngineData] = useState(null);
  const [engineCatalog, setEngineCatalog] = useState(null);
  const [installJob, setInstallJob] = useState(null);
  const [activeTab, setActiveTab] = useState('library');
  const [, setHasMlxModels] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingEngines, setLoadingEngines] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [startingModel, setStartingModel] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [deletingModel, setDeletingModel] = useState(null);
  const [switchingEngine, setSwitchingEngine] = useState(null);
  const [installingEngine, setInstallingEngine] = useState(null);
  const [switchError, setSwitchError] = useState('');
  const [switchSuccess, setSwitchSuccess] = useState('');
  const [installError, setInstallError] = useState('');
  const [installSuccess, setInstallSuccess] = useState('');
  const [revertSelection, setRevertSelection] = useState(null);
  const [quickLoadPath, setQuickLoadPath] = useState('');
  const [pythonInstallJob, setPythonInstallJob] = useState(null);
  const [pythonBuildError, setPythonBuildError] = useState('');
  const [pythonBuildSuccess, setPythonBuildSuccess] = useState('');
  const [modelLoadCtxSizes, setModelLoadCtxSizes] = useState(loadSavedModelContextSizes);
  const [modelLoadCtxErrors, setModelLoadCtxErrors] = useState({});
  const [providerCatalog, setProviderCatalog] = useState([]);
  const [providerProfiles, setProviderProfiles] = useState([]);
  const [providerConfig, setProviderConfig] = useState(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providerAction, setProviderAction] = useState(null);
  const [providerError, setProviderError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const pollCleanup = useRef(null);
  const installPollCleanup = useRef(null);
  const pythonBuildPollCleanup = useRef(null);

  useEffect(() => {
    loadStatus();
    loadModelList();
    loadEngineData();
    loadEngineCatalog();
    loadProviderData();
    return () => {
      pollCleanup.current?.();
      installPollCleanup.current?.();
      pythonBuildPollCleanup.current?.();
    };
  }, []);

  const clearEngineActionMessages = () => {
    setSwitchError('');
    setSwitchSuccess('');
    setInstallError('');
    setInstallSuccess('');
    setRevertSelection(null);
  };

  const updateModelLoadCtxSize = (filename, value) => {
    setModelLoadCtxSizes(prev => ({ ...prev, [filename]: value }));
    setModelLoadCtxErrors(prev => ({ ...prev, [filename]: '' }));
  };

  const commitModelLoadCtxSize = (filename, max = MAX_LOAD_CTX_SIZE) => {
    const fallback = Math.min(DEFAULT_LOAD_CTX_SIZE, max);
    const rawValue = modelLoadCtxSizes[filename] ?? String(fallback);
    const error = getModelLoadCtxError(rawValue, max);
    if (error) {
      setModelLoadCtxErrors(prev => ({ ...prev, [filename]: error }));
      return null;
    }
    const ctxSize = normalizeLoadCtxSize(rawValue, fallback, max);
    const nextValue = String(ctxSize);
    setModelLoadCtxSizes(prev => {
      const next = { ...prev, [filename]: nextValue };
      saveModelContextSizes(next);
      return next;
    });
    setModelLoadCtxErrors(prev => ({ ...prev, [filename]: '' }));
    return ctxSize;
  };

  const getRetryModelContext = () => {
    const filename = serverStatus?.model;
    if (!filename) return undefined;
    const model = models.find(item => item.filename === filename);
    const ctxSize = commitModelLoadCtxSize(filename, getModelContextLimit(model));
    return ctxSize || undefined;
  };

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const [llamaSnap, mlxSnap] = await Promise.all([
        llamaServerApi.getStatus().catch(() => null),
        mlxApi.getStatus().catch(() => null)
      ]);
      const isMlxActive = mlxSnap && (mlxSnap.status === 'ready' || mlxSnap.status === 'loading');
      setServerStatus(isMlxActive ? mlxSnap : (llamaSnap || { status: 'idle' }));
    } catch (err) {
      console.warn('Failed to load server status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadModelList = async () => {
    setLoadingModels(true);
    try {
      const [ggufRes, mlxRes] = await Promise.all([
        localModelsApi.listModels(),
        mlxApi.listModels().catch(() => ({ models: [] }))
      ]);
      const ggufModels = ggufRes?.models ?? [];
      const mlxModels = mlxRes?.models ?? [];

      const unifiedModels = [
        ...ggufModels.map(m => ({ ...m, engineType: 'gguf' })),
        ...mlxModels.map(m => ({ ...m, engineType: 'mlx', filename: m.path }))
      ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      setModels(unifiedModels);
      setHasMlxModels(mlxModels.length > 0);
    } catch (err) {
      console.warn('Failed to load unified model list:', err);
    } finally {
      setLoadingModels(false);
    }
  };

  const loadEngineData = async ({ clearActions = false } = {}) => {
    setLoadingEngines(true);
    try {
      const res = await llamaServerApi.getEngines();
      if (res.success) {
        setEngineData(res);
        if (clearActions && res.recommendation?.state === 'current_ok') {
          clearEngineActionMessages();
        }
      }
    } catch (err) {
      console.warn('Failed to load engine advisor:', err);
    } finally {
      setLoadingEngines(false);
    }
  };

  const beginInstallJobPolling = (jobId) => {
    if (!jobId) return;
    installPollCleanup.current?.();
    installPollCleanup.current = llamaServerApi.pollInstallJob(
      jobId,
      (job) => setInstallJob(job),
      async (job) => {
        setInstallJob(job);
        setInstallingEngine(null);
        installPollCleanup.current = null;
        if (job.advisor) setEngineData(job.advisor);
        if (job.statusSnapshot) setServerStatus(job.statusSnapshot);
        await loadEngineCatalog(true);
        await loadEngineData();

        if (job.retry?.attempted && !job.retry.success) {
          setInstallError(job.retry.error || 'Engine installed, but retrying the model failed.');
          setRevertSelection(job.previousSelection || null);
          return;
        }

        const label = INSTALL_PROFILE_LABELS[job.install?.profile] || 'Managed engine';
        const asset = job.install?.asset ? ` (${job.install.asset})` : '';
        setInstallSuccess(`${label} installed${asset}. GPU layers set to ${job.install?.gpuLayers}.`);
        setInstallError('');
        setRevertSelection(null);

        if (job.retry?.attempted && job.retry.success) {
          pollInstallRetry(job.previousSelection || null, job.install?.profile || job.profile || 'cpu_safe');
        }
      },
      async (job) => {
        setInstallJob(job);
        setInstallingEngine(null);
        installPollCleanup.current = null;
        setInstallError(job?.error || 'Failed to install engine.');
        await loadEngineCatalog(true);
      },
    );
  };

  const beginPythonInstallJobPolling = (jobId) => {
    if (!jobId) return;
    pythonBuildPollCleanup.current?.();
    pythonBuildPollCleanup.current = llamaServerApi.pollPythonInstallJob(
      jobId,
      (job) => setPythonInstallJob(job),
      async (job) => {
        setPythonInstallJob(job);
        pythonBuildPollCleanup.current = null;
        if (job.advisor) setEngineData(job.advisor);
        if (job.statusSnapshot) setServerStatus(job.statusSnapshot);
        await loadEngineData();
        setPythonBuildSuccess(`GPU runtime built. GPU layers set to ${job.install?.gpuLayers ?? 0}.`);
        setPythonBuildError('');
      },
      async (job) => {
        setPythonInstallJob(job);
        pythonBuildPollCleanup.current = null;
        setPythonBuildError(job?.error || 'GPU runtime build failed.');
      },
    );
  };

  const handleBuildGpuRuntime = async (profile, retryModelAfterBuild) => {
    setPythonBuildError('');
    setPythonBuildSuccess('');
    try {
      const ctxSize = retryModelAfterBuild ? getRetryModelContext() : undefined;
      const res = await llamaServerApi.startPythonInstallJob({
        profile,
        retryModel: retryModelAfterBuild ? serverStatus?.model || undefined : undefined,
        ctxSize,
      });
      const job = res.job;
      setPythonInstallJob(job);
      beginPythonInstallJobPolling(job.id);
    } catch (err) {
      setPythonBuildError(err.message || 'Failed to start GPU runtime build.');
    }
  };

  const loadEngineCatalog = async (refresh = false) => {
    setLoadingCatalog(true);
    try {
      const res = await llamaServerApi.getEngineCatalog(refresh);
      if (res.success) {
        setEngineCatalog(res);
        const activeJob = res.activeJob || null;
        setInstallJob(activeJob);
        if (activeJob) {
          if (activeJob.status === 'queued' || activeJob.status === 'running') {
            setInstallingEngine(`install:${activeJob.profile || 'cpu_safe'}${activeJob.retryModel ? ':retry' : ''}`);
          } else {
            setInstallingEngine(null);
          }
          if (activeJob.status === 'queued' || activeJob.status === 'running') {
            beginInstallJobPolling(activeJob.id);
          }
        } else {
          setInstallingEngine(null);
        }
      }
    } catch (err) {
      console.warn('Failed to load engine catalog:', err);
    } finally {
      setLoadingCatalog(false);
    }
  };

  const loadProviderData = async () => {
    setLoadingProviders(true);
    setProviderError('');
    try {
      const [catalogRes, profilesRes, configRes] = await Promise.all([
        aiProviderApi.getCatalog(),
        aiProviderApi.listProfiles(),
        aiProviderApi.getConfig(),
      ]);
      setProviderCatalog(catalogRes.providers || []);
      setProviderProfiles(profilesRes.profiles || []);
      setProviderConfig(configRes || null);
    } catch (err) {
      setProviderError(err.message || 'Failed to load providers.');
    } finally {
      setLoadingProviders(false);
    }
  };

  const handleProviderSave = async (id, payload) => {
    const actionId = id || 'new';
    setProviderAction(actionId);
    setProviderError('');
    try {
      if (id) {
        await aiProviderApi.updateProfile(id, payload);
      } else {
        await aiProviderApi.createProfile(payload);
      }
      await loadProviderData();
    } catch (err) {
      setProviderError(err.message || 'Failed to save provider.');
      throw err;
    } finally {
      setProviderAction(null);
    }
  };

  const handleProviderDelete = async (id) => {
    setProviderAction(id);
    setProviderError('');
    try {
      await aiProviderApi.deleteProfile(id);
      await loadProviderData();
    } catch (err) {
      setProviderError(err.message || 'Failed to delete provider.');
    } finally {
      setProviderAction(null);
    }
  };

  const handleProviderTest = async (id) => {
    setProviderAction(id);
    setProviderError('');
    try {
      await aiProviderApi.testProfile(id);
      await loadProviderData();
    } catch (err) {
      setProviderError(err.message || 'Provider test failed.');
      await loadProviderData();
    } finally {
      setProviderAction(null);
    }
  };

  const handleProviderActivate = async (id, stopLocal = false) => {
    setProviderAction(id);
    setProviderError('');
    try {
      await aiProviderApi.activateProfile(id, { stopLocal });
      await Promise.all([loadProviderData(), loadStatus()]);
    } catch (err) {
      setProviderError(err.message || 'Failed to activate provider.');
    } finally {
      setProviderAction(null);
    }
  };

  const handleProviderDeactivate = async () => {
    setProviderAction('deactivate');
    setProviderError('');
    try {
      await aiProviderApi.deactivate();
      await loadProviderData();
    } catch (err) {
      setProviderError(err.message || 'Failed to deactivate provider.');
    } finally {
      setProviderAction(null);
    }
  };

  const handleLoadProviderModels = async (id) => {
    try {
      const res = await aiProviderApi.listProviderModels(id);
      return res.models || [];
    } catch (err) {
      setProviderError(err.message || 'Failed to load provider models.');
      return [];
    }
  };

  const pollEngineRetry = (previousSelection = null) => {
    pollCleanup.current?.();
    pollCleanup.current = llamaServerApi.pollStatus(
      (snap) => setServerStatus(snap),
      async (snap) => {
        setServerStatus(snap);
        pollCleanup.current = null;
        setSwitchSuccess(`Engine switched and ${snap.model || 'the model'} is loading successfully.`);
        setSwitchError('');
        setRevertSelection(null);
        await loadEngineData();
      },
      async (snap) => {
        setServerStatus(snap);
        pollCleanup.current = null;
        setSwitchError(snap?.error || 'Engine switched, but retrying the model failed.');
        if (previousSelection) setRevertSelection(previousSelection);
        await loadEngineData();
      },
    );
  };

  const pollInstallRetry = (previousSelection = null, profile = 'cpu_safe') => {
    pollCleanup.current?.();
    pollCleanup.current = llamaServerApi.pollStatus(
      (snap) => setServerStatus(snap),
      async (snap) => {
        setServerStatus(snap);
        pollCleanup.current = null;
        setInstallSuccess(`${INSTALL_PROFILE_LABELS[profile] || 'Managed engine'} installed and ${snap.model || 'the model'} is loading successfully.`);
        setInstallError('');
        setRevertSelection(null);
        await loadEngineData();
      },
      async (snap) => {
        setServerStatus(snap);
        pollCleanup.current = null;
        setInstallError(snap?.error || 'Engine installed, but retrying the model failed.');
        if (previousSelection) setRevertSelection(previousSelection);
        await loadEngineData();
      },
    );
  };

  const handleStart = async (filename, modelContextLimit = MAX_LOAD_CTX_SIZE) => {
    const ctxSize = commitModelLoadCtxSize(filename, modelContextLimit);
    if (!ctxSize) return;
    setStartingModel(filename);
    setModelContextConfig({ ctx_size: ctxSize });
    try {
      await llamaServerApi.start(filename, ctxSize);
      setServerStatus(prev => ({ ...prev, status: 'loading', model: filename }));
      pollCleanup.current?.();
      pollCleanup.current = llamaServerApi.pollStatus(
        (snap) => setServerStatus(snap),
        async (snap) => { setServerStatus(snap); setStartingModel(null); pollCleanup.current = null; await loadProviderData(); },
        (snap) => { setServerStatus(snap); setStartingModel(null); pollCleanup.current = null; },
      );
    } catch (err) {
      setServerStatus(prev => ({ ...prev, status: 'error', error: err.message }));
      setStartingModel(null);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    pollCleanup.current?.();
    pollCleanup.current = null;
    try {
      // Safely attempt to stop both engines to guarantee a clean state
      await Promise.all([
        mlxApi.stop().catch(e => console.warn('MLX stop ignored:', e)),
        llamaServerApi.stop().catch(e => console.warn('Llama stop ignored:', e))
      ]);
      setServerStatus({ status: 'idle', model: null });
      await loadProviderData();
      await loadStatus();
    } catch (err) {
      console.error('Failed to stop server:', err);
    } finally {
      setStopping(false);
    }
  };

  const handleDelete = (m) => {
    setDeleteError('');
    setDeleteConfirm(m);
  };

  const confirmDelete = async () => {
    const m = deleteConfirm;
    setDeleteConfirm(null);
    setDeletingModel(m.filename);
    setDeleteError('');
    try {
      if (m.isExternal) {
        await localModelsApi.deleteCustomPath(m.id);
      } else {
        await localModelsApi.deleteModel(m.filename);
      }
      await loadModelList();
    } catch (err) {
      setDeleteError(err.message || 'Failed to remove model');
    } finally {
      setDeletingModel(null);
    }
  };

  const handleAddPath = async () => {
    const p = quickLoadPath.trim();
    if (!p) return;
    
    // Clean up path and extract a friendly name
    const cleanPath = p.replace(/[\\/]+$/, '');
    const name = cleanPath.split(/[\\/]/).pop().replace(/\.(gguf|bin)$/i, '') || 'Custom Model';
    
    try {
      setSwitchingEngine('adding_path');
      const res = await localModelsApi.saveCustomPath(name, p, 'auto');
      setSwitchSuccess(`Added "${name}" as ${res.type?.toUpperCase() || 'model'} to your library`);
      setQuickLoadPath('');
      await loadModelList();
    } catch (err) {
      setSwitchError(err.message || 'Failed to add path');
    } finally {
      setSwitchingEngine(null);
    }
  };

  const handleEngineSwitch = async (selection, retryModelAfterSwitch) => {
    const key = `${selection.runtime}:${selection.path}${retryModelAfterSwitch ? ':retry' : ''}`;
    const ctxSize = retryModelAfterSwitch ? getRetryModelContext() : undefined;
    if (ctxSize) {
      setModelContextConfig({ ctx_size: ctxSize });
    }
    setSwitchingEngine(key);
    setSwitchError('');
    setSwitchSuccess('');
    setInstallError('');
    setInstallSuccess('');
    try {
      const res = await llamaServerApi.selectEngine({
        runtime: selection.runtime,
        path: selection.path,
        retryModel: retryModelAfterSwitch ? serverStatus?.model || undefined : undefined,
        ctxSize,
      });

      setEngineData(res.advisor || null);
      setServerStatus(res.statusSnapshot || null);

      if (res.retry?.attempted && !res.retry.success) {
        setSwitchError(res.retry.error || 'Engine switched, but retrying the model failed.');
        setRevertSelection(res.previousSelection || null);
      } else {
        setSwitchSuccess(`Engine switched to ${res.applied?.runtime === 'python' ? 'Python runtime' : 'native binary'} with GPU layers set to ${res.applied?.gpuLayers}.`);
        setRevertSelection(null);
      }

      if (res.retry?.attempted && res.retry.success) {
        pollEngineRetry(res.previousSelection || null);
      } else {
        await loadEngineData();
      }
    } catch (err) {
      setSwitchError(err.message || 'Failed to switch engine.');
    } finally {
      setSwitchingEngine(null);
    }
  };

  const handleManagedInstall = async (selection, retryModelAfterInstall) => {
    const profile = selection?.profile || 'cpu_safe';
    const key = `install:${profile}${retryModelAfterInstall ? ':retry' : ''}`;
    const ctxSize = retryModelAfterInstall ? getRetryModelContext() : undefined;
    if (ctxSize) {
      setModelContextConfig({ ctx_size: ctxSize });
    }
    setInstallingEngine(key);
    setInstallError('');
    setInstallSuccess('');
    setSwitchError('');
    setSwitchSuccess('');
    try {
      const res = await llamaServerApi.startInstallJob({
        profile,
        releaseTag: selection?.releaseTag,
        assetName: selection?.assetName,
        retryModel: retryModelAfterInstall ? serverStatus?.model || undefined : undefined,
        ctxSize,
      });
      const job = res.job;
      setInstallJob(job);
      await loadEngineCatalog(true);
      beginInstallJobPolling(job.id);
    } catch (err) {
      setInstallError(err.message || 'Failed to install engine.');
      setInstallingEngine(null);
    }
  };


  return {
    modelContextConfig,
    serverStatus,
    setServerStatus,
    models,
    engineData,
    engineCatalog,
    installJob,
    setInstallJob,
    activeTab,
    setActiveTab,
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
  };
};
