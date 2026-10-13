import { lazy, Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  RefreshCw, TriangleAlert, X,
  Mic, Volume2, Image, MessageSquare, BarChart3, GraduationCap, Loader2
} from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { Segmented, Tabs } from '../components/ui/Tabs.jsx';
import ActiveBrainPanel from './ActiveBrainPanel.jsx';
import ProvidersSection from './ProvidersSection.jsx';
import LocalModelsPane from './LocalModelsPane.jsx';
import AudioModelsSection from './AudioModelsSection.jsx';
import VisualModelsSection from './VisualModelsSection.jsx';
import CapabilityProvidersSection from './CapabilityProvidersSection.jsx';
import ModelUsageSection from './ModelUsageSection.jsx';
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx';
import ModelDownloadHub from './ModelDownloadHub.jsx';
import ManagedEngineCard from './ManagedEngineCard.jsx';
import LocalEnginePanel from './LocalEnginePanel.jsx';
import {
  STATUS_META, conciseHardwareSummary, getModelContextLimit,
  providerLabel
} from './modelPageShared.jsx';
import { useModelsPageController } from './useModelsPageController.js';
import { audioApi, visualModelsApi, aiProviderApi } from '../Settings/settingApi.js';

// Fine-tuning lives under Models but loads its own chunk (it brings charts).
const TrainingPage = lazy(() => import('../Training/TrainingPage.jsx'));

const TAB_KEYS = ['chat', 'audio', 'image', 'usage', 'training'];

const VIEW_KEYS = ['connected', 'add', 'local'];

const TAB_SUBTITLES = {
  chat: 'Choose what powers chats and agents: a cloud provider, a server on your computer, or a downloaded model.',
  audio: 'Speech to text and text to speech, on your computer or through a provider.',
  image: 'Generate images with a downloaded model or a cloud provider.',
  usage: 'Requests and tokens your models have handled.',
  training: 'Fine-tune models on your own data.',
};

// ── Main page ─────────────────────────────────────────────────────────────────
const ModelsPage = () => {
  const controller = useModelsPageController();
  const {
    modelContextConfig, serverStatus, setServerStatus, mlxStatus,
    models, engineData, setInstallJob,
    loadingModels, loadingStatus, loadingEngines, loadingCatalog,
    startingModel, setStartingModel, stopping, deletingModel,
    switchingEngine, installingEngine, switchError, setSwitchError,
    switchSuccess, setSwitchSuccess,
    quickLoadPath, setQuickLoadPath,
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
    handleAddPath,
  } = controller;

  // ── Derived state ──────────────────────────────────────────────────────────
  const status = serverStatus?.status ?? 'idle';
  const { label: statusLabel } = STATUS_META[status] || STATUS_META.idle;
  const isRunning = status === 'ready' || status === 'loading';
  const isReady = status === 'ready';

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
  const [audioModels, setAudioModels] = useState({ whisper: [], tts: [] });
  const [visualModels, setVisualModels] = useState({ image: [] });
  const [highlightedItem, setHighlightedItem] = useState(null);
  const [usageRange, setUsageRange] = useState('30d');
  const [modelUsage, setModelUsage] = useState(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [usageError, setUsageError] = useState('');

  const refreshVoiceData = useCallback(() => {
    Promise.all([
      audioApi.listModels().catch(() => ({ whisper: [], tts: [] })),
      audioApi.whisper.getStatus().catch(() => ({ status: 'idle' })),
      audioApi.tts.getStatus().catch(() => ({ status: 'idle' })),
    ]).then(([modelsRes, w, t]) => {
      setAudioModels({
        whisper: modelsRes.whisper || [],
        tts: modelsRes.tts || [],
      });
      setVoiceState({
        sttStatus: w.status || 'idle',
        sttModel: w.model || null,
        ttsStatus: t.status || 'idle',
        ttsModel: t.model || null,
        loaded: true,
      });
    });
  }, []);

  const refreshVisualData = useCallback(() => {
    visualModelsApi.listModels()
      .then((modelsRes) => {
        setVisualModels({
          image: modelsRes.image || [],
        });
      })
      .catch(() => setVisualModels({ image: [] }));
  }, []);

  const refreshUsageData = useCallback(() => {
    setLoadingUsage(true);
    setUsageError('');
    aiProviderApi.getUsage({ range: usageRange, limit: 12 })
      .then(setModelUsage)
      .catch(err => setUsageError(err.message || 'Failed to load model usage.'))
      .finally(() => setLoadingUsage(false));
  }, [usageRange]);

  useEffect(() => {
    refreshVoiceData();
    refreshVisualData();
  }, [refreshVoiceData, refreshVisualData]);

  useEffect(() => {
    refreshUsageData();
  }, [refreshUsageData]);

  // ── Task navigation ───────────────────────────────────────────────────────
  // The tab is kept in the URL (?tab=audio) so links like /training can open it.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = TAB_KEYS.includes(requestedTab) ? requestedTab : 'chat';
  const setActiveTab = useCallback((key) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (key === 'chat') next.delete('tab');
      else next.set('tab', key);
      next.delete('view');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Inside Language: Connected, Add provider or Local models (?view=add).
  const requestedView = searchParams.get('view');
  const activeView = VIEW_KEYS.includes(requestedView) ? requestedView : 'connected';
  const setActiveView = useCallback((key) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('tab');
      if (key === 'connected') next.delete('view');
      else next.set('view', key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // ── Unified search ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  const downloadedMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matches = [];
    for (const m of models) {
      const haystack = [m.name, m.filename, m.architecture, m.engineType].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) continue;
      const isActive = status === 'ready' && serverStatus?.model && (serverStatus.model === m.name || serverStatus.model === m.filename);
      matches.push({
        type: 'model',
        category: 'model',
        id: m.id || m.filename,
        name: m.name || m.filename,
        detail: [m.engineType?.toUpperCase(), m.sizeFormatted, m.architecture].filter(Boolean).join(' · ') || 'Local model',
        isActive,
      });
    }
    for (const m of audioModels.whisper) {
      const haystack = [m.name, m.filename, m.quality, m.language, 'stt whisper'].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) continue;
      matches.push({
        type: 'whisper',
        category: 'audio',
        id: m.id || m.filename,
        name: m.name || m.filename,
        detail: ['Whisper', m.quality, m.language, m.sizeFormatted].filter(Boolean).join(' · '),
        isActive: false,
      });
    }
    for (const m of audioModels.tts) {
      const haystack = [m.name, m.filename, m.qualityLabel, m.languageName, 'tts piper'].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) continue;
      matches.push({
        type: 'tts',
        category: 'audio',
        id: m.id || m.filename,
        name: m.name || m.filename,
        detail: ['Piper', m.qualityLabel, m.languageName, m.sizeFormatted].filter(Boolean).join(' · '),
        isActive: false,
      });
    }
    for (const m of visualModels.image) {
      const haystack = [m.name, m.filename, m.assetKind, 'image generation diffusion stable flux sdxl'].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) continue;
      matches.push({
        type: 'image',
        category: 'image',
        id: m.id || m.filename,
        name: m.name || m.filename,
        detail: [m.assetKind, m.sizeFormatted].filter(Boolean).join(' · '),
        isActive: false,
      });
    }
    for (const p of providerProfiles) {
      const preset = providerCatalog.find(item => item.providerId === p.provider_id || item.id === p.provider_id);
      const haystack = [
        p.name,
        p.provider_id,
        preset?.name,
        p.model,
        p.base_url,
        'provider cloud api endpoint',
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) continue;
      const isProviderActive = providerConfig?.provider_id === p.provider_id;
      matches.push({
        type: 'provider',
        category: 'provider',
        id: p.id,
        name: p.name,
        detail: [preset?.name || p.provider_id, p.model, p.provider_type === 'local' ? 'Local' : 'Cloud'].filter(Boolean).join(' · '),
        isActive: isProviderActive,
      });
    }
    return matches.slice(0, 12);
  }, [audioModels.tts, audioModels.whisper, models, searchQuery, visualModels.image, providerProfiles, providerCatalog, status, serverStatus, providerConfig]);

  const handleDownloadedSelect = (item) => {
    setHighlightedItem(item);
    if (item.type === 'model') setActiveView('local');
    if (item.type === 'provider') setActiveView('connected');
    if (item.type === 'whisper' || item.type === 'tts') setActiveTab('audio');
    if (item.type === 'image') setActiveTab('image');
    window.setTimeout(() => {
      const id = item.type === 'model'
        ? `model-card-${item.id}`
        : item.type === 'whisper' || item.type === 'tts'
          ? `audio-card-${item.type}-${item.id}`
          : item.type === 'provider'
            ? `provider-card-${item.id}`
            : `visual-card-${item.type}-${item.id}`;
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
  };

  // ── Refresh handler ────────────────────────────────────────────────────────
  const handleRefresh = () => {
    clearEngineActionMessages();
    setInstallJob(null);
    loadStatus();
    loadModelList();
    refreshVoiceData();
    refreshVisualData();
    refreshUsageData();
    loadEngineData({ clearActions: true });
    loadEngineCatalog(true);
    loadProviderData();
  };

  const audioAssetCount = audioModels.whisper.length + audioModels.tts.length;
  const usageRequestCount = modelUsage?.totals?.request_count || 0;

  const audioMeta = (() => {
    if (!voiceState.loaded) return audioAssetCount ? String(audioAssetCount) : null;
    if (voiceState.sttStatus === 'error' || voiceState.ttsStatus === 'error') return 'Error';
    if (voiceState.sttStatus === 'ready' || voiceState.ttsStatus === 'ready') return 'On';
    return audioAssetCount ? String(audioAssetCount) : null;
  })();

  const tabItems = [
    { value: 'chat', label: 'Language', icon: MessageSquare },
    { value: 'audio', label: 'Voice', icon: Mic, meta: audioMeta },
    { value: 'image', label: 'Images', icon: Image, meta: visualModels.image.length ? String(visualModels.image.length) : null },
    { value: 'usage', label: 'Usage', icon: BarChart3, meta: usageRequestCount ? usageRequestCount.toLocaleString() : null },
    { value: 'training', label: 'Training', icon: GraduationCap, meta: 'Labs' },
  ];

  const viewItems = [
    { value: 'connected', label: 'Connected', meta: providerProfiles.length ? String(providerProfiles.length) : null },
    { value: 'add', label: 'Add provider' },
    { value: 'local', label: 'Local models', meta: models.length ? String(models.length) : null },
  ];

  const loadLocalModel = (model) => {
    if (model.engineType === 'mlx') {
      // MLX models start from their card, which handles the separate server.
      setHighlightedItem({ type: 'model', id: model.id || model.filename });
      setActiveView('local');
      return;
    }
    handleStart(model.path || model.filename, getModelContextLimit(model));
  };

  const downloadHub = (
    <ModelDownloadHub
      searchQuery={searchQuery}
      downloadedMatches={downloadedMatches}
      onSearchQueryChange={setSearchQuery}
      onDownloadedSelect={handleDownloadedSelect}
      onModelRefresh={loadModelList}
      onAudioRefresh={refreshVoiceData}
      onVisualRefresh={refreshVisualData}
    />
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div data-models-page className="flex h-full w-full flex-col bg-canvas text-fg">
      <ConfirmDeleteDialog
        model={deleteConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      <header className="shrink-0 border-b border-line px-6 pt-6 lg:px-10">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">Models</h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-5 text-fg-muted">{TAB_SUBTITLES[activeTab]}</p>
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={handleRefresh} loading={isLoading} disabled={isBusy}>
            Refresh
          </Button>
        </div>
        <div className="mx-auto mt-4 max-w-5xl">
          <Tabs value={activeTab} onChange={setActiveTab} items={tabItems} label="Model types" />
        </div>
      </header>

      {activeTab === 'training' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={(
            <div className="flex h-full items-center justify-center text-fg-subtle" role="status" aria-label="Loading training">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}>
            <TrainingPage />
          </Suspense>
        </div>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-6 lg:px-10">
            {deleteError ? (
              <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-[13px] text-red-700 dark:text-red-400">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                <span className="flex-1">{deleteError}</span>
                <button type="button" onClick={() => setDeleteError('')} aria-label="Dismiss" className="rounded p-0.5 hover:bg-red-500/10"><X className="h-3.5 w-3.5" /></button>
              </p>
            ) : null}

            {activeTab === 'chat' && (
              <>
                <ActiveBrainPanel
                  activeConfig={providerConfig}
                  activeProviderName={activeProviderName}
                  serverStatus={serverStatus}
                  statusLabel={statusLabel}
                  isReady={isReady}
                  isRunning={isRunning}
                  stopping={stopping}
                  engineData={engineData}
                  hardwareBadgeLabel={hardwareBadgeLabel}
                  showHardwareBadge={showHardwareBadge}
                  providerAction={providerAction}
                  switchingEngine={switchingEngine}
                  installingEngine={installingEngine}
                  voiceState={voiceState}
                  visualModels={visualModels}
                  profiles={providerProfiles}
                  localModels={models}
                  onStop={handleStop}
                  onDeactivateProvider={handleProviderDeactivate}
                  onActivateProfile={(profile) => handleProviderActivate(profile.id, false)}
                  onLoadLocalModel={loadLocalModel}
                  onBrowseProviders={() => setActiveView('add')}
                />

                <Segmented value={activeView} onChange={setActiveView} items={viewItems} label="Language model sources" />

                {activeView === 'local' ? (
                  <div className="space-y-6">
                    <LocalEnginePanel controller={controller} />
                    {downloadHub}
                    <LocalModelsPane
                      models={models}
                      loadingModels={loadingModels}
                      serverStatus={serverStatus}
                      status={status}
                      mlxStatus={mlxStatus}
                      activeMlxModel={providerConfig?.provider_id === 'mlx-builtin' ? providerConfig.model : null}
                      startingModel={startingModel}
                      setStartingModel={setStartingModel}
                      deletingModel={deletingModel}
                      switchingEngine={switchingEngine}
                      installingEngine={installingEngine}
                      highlightedItem={highlightedItem}
                      quickLoadPath={quickLoadPath}
                      setQuickLoadPath={setQuickLoadPath}
                      modelContextConfig={modelContextConfig}
                      setServerStatus={setServerStatus}
                      pollCleanup={pollCleanup}
                      loadEngineData={loadEngineData}
                      loadProviderData={loadProviderData}
                      loadStatus={loadStatus}
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
                ) : (
                  <ProvidersSection
                    view={activeView}
                    onViewChange={setActiveView}
                    catalog={providerCatalog}
                    profiles={providerProfiles}
                    activeConfig={providerConfig}
                    serverStatus={serverStatus}
                    loading={loadingProviders}
                    providerAction={providerAction}
                    providerError={providerError}
                    highlightedItem={highlightedItem}
                    onRefresh={loadProviderData}
                    onSave={handleProviderSave}
                    onDelete={handleProviderDelete}
                    onTest={handleProviderTest}
                    onActivate={handleProviderActivate}
                    onLoadModels={handleLoadProviderModels}
                  />
                )}
              </>
            )}

            {activeTab === 'audio' && (
              <>
                {downloadHub}
                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="space-y-4">
                    <h2 className="flex items-center gap-2 text-[14px] font-semibold text-fg">
                      <Mic className="h-4 w-4 text-fg-subtle" /> Speech to text
                    </h2>
                    <ManagedEngineCard
                      runtimeId="whisper"
                      name="whisper.cpp"
                      purpose="Turns speech into text on this computer, for the mic and voice mode."
                      icon={Mic}
                      onChanged={refreshVoiceData}
                    />
                    <CapabilityProvidersSection capability="stt" />
                    <AudioModelsSection mode="whisper" highlightedItem={highlightedItem} onModelsChange={setAudioModels} />
                  </div>
                  <div className="space-y-4">
                    <h2 className="flex items-center gap-2 text-[14px] font-semibold text-fg">
                      <Volume2 className="h-4 w-4 text-fg-subtle" /> Text to speech
                    </h2>
                    <ManagedEngineCard
                      runtimeId="piper"
                      name="Piper"
                      purpose="Reads answers aloud on this computer, with natural voices."
                      icon={Volume2}
                      onChanged={refreshVoiceData}
                    />
                    <CapabilityProvidersSection capability="tts" />
                    <AudioModelsSection mode="tts" highlightedItem={highlightedItem} onModelsChange={setAudioModels} />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'image' && (
              <>
                <ManagedEngineCard
                  runtimeId="sd"
                  name="stable-diffusion.cpp"
                  purpose="Makes images on this computer from downloaded models; uses your GPU when it can."
                  icon={Image}
                  onChanged={refreshVisualData}
                />
                {downloadHub}
                <CapabilityProvidersSection capability="image" />
                <VisualModelsSection highlightedItem={highlightedItem} onModelsChange={setVisualModels} />
              </>
            )}

            {activeTab === 'usage' && (
              <ModelUsageSection
                usage={modelUsage}
                loading={loadingUsage}
                error={usageError}
                range={usageRange}
                onRangeChange={setUsageRange}
                onRefresh={refreshUsageData}
                catalog={providerCatalog}
              />
            )}
          </div>
        </main>
      )}
    </div>
  );
};

export default ModelsPage;
