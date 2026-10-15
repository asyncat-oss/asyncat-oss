// Models: language models, voice, images, usage and training under one page,
// with one search across the models and providers on it.

import { lazy, Suspense, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, X, Loader2 } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import IconButton from '../components/ui/IconButton.jsx';
import Notice from '../components/ui/Notice.jsx';
import { Segmented, Tabs } from '../components/ui/Tabs.jsx';
import ActiveBrainPanel from './ActiveBrainPanel.jsx';
import ProvidersSection from './ProvidersSection.jsx';
import LocalModelsPane from './LocalModelsPane.jsx';
import ModelUsageSection from './ModelUsageSection.jsx';
import ModelDownloadHub from './ModelDownloadHub.jsx';
import LocalEnginePanel from './LocalEnginePanel.jsx';
import VoicePage from './media/VoicePage.jsx';
import ImagesPage from './media/ImagesPage.jsx';
import { onEvents } from './media/notify.js';
import {
  STATUS_META, conciseHardwareSummary,
  providerLabel
} from './modelPageShared.jsx';
import { useModelsPageController } from './useModelsPageController.js';
import { keepActiveInView } from './keepActiveInView.js';
import { audioApi, visualModelsApi, aiProviderApi } from '../Settings/settingApi.js';

// Fine-tuning lives under Models but loads its own chunk (it brings charts).
const TrainingPage = lazy(() => import('../Training/TrainingPage.jsx'));

const TAB_KEYS = ['chat', 'audio', 'image', 'usage', 'training'];

const VIEW_KEYS = ['connected', 'add', 'local'];

const TAB_SUBTITLES = {
  chat: 'Choose what powers chats and agents: a cloud provider, a server on your computer, or a downloaded model.',
  audio: 'Talk to Asyncat with the mic, and hear answers read aloud.',
  image: 'Let Asyncat make and change images, in chats or here.',
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
    deleteError, setDeleteError,
    pollCleanup, clearEngineActionMessages,
    updateModelLoadCtxSize, commitModelLoadCtxSize,
    loadStatus, loadModelList, loadEngineData, loadEngineCatalog, loadProviderData,
    handleProviderSave, handleProviderDelete, handleProviderTest,
    handleProviderActivate, handleProviderDeactivate, handleMakeLocalDefault, handleLoadProviderModels,
    handleStart, handleStop, handleDelete,
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

  // ── Voice and image files, for the search ──────────────────────────────────
  const [audioModels, setAudioModels] = useState({ whisper: [], tts: [] });
  const [visualModels, setVisualModels] = useState({ image: [] });
  const [highlightedItem, setHighlightedItem] = useState(null);
  const [voiceHighlight, setVoiceHighlight] = useState(null);
  const [imageHighlight, setImageHighlight] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [usageRange, setUsageRange] = useState('30d');
  const [modelUsage, setModelUsage] = useState(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [usageError, setUsageError] = useState('');

  const refreshVoiceData = useCallback(() => {
    audioApi.listModels()
      .then((modelsRes) => {
        setAudioModels({
          whisper: modelsRes.whisper || [],
          tts: modelsRes.tts || [],
        });
      })
      .catch(() => setAudioModels({ whisper: [], tts: [] }));
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

  // Files added or deleted on the Voice and Images tabs show in the search at once.
  useEffect(() => onEvents(['asyncat-audio-models-updated'], refreshVoiceData), [refreshVoiceData]);
  useEffect(() => onEvents(['asyncat-visual-models-updated'], refreshVisualData), [refreshVisualData]);

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

  // On a phone the tab row and the source switch scroll sideways; the one
  // that is on always shows.
  const tabRowRef = useRef(null);
  const viewSwitchRef = useRef(null);
  useLayoutEffect(() => keepActiveInView(tabRowRef.current), [activeTab]);
  useLayoutEffect(() => keepActiveInView(viewSwitchRef.current), [activeTab, activeView, models.length, providerProfiles.length]);

  // A search's highlight shows once: leaving its tab drops it, so coming
  // back doesn't flash the row and scroll to it again.
  const [highlightTab, setHighlightTab] = useState(activeTab);
  if (highlightTab !== activeTab) {
    setHighlightTab(activeTab);
    if (highlightTab === 'audio') setVoiceHighlight(null);
    if (highlightTab === 'image') setImageHighlight(null);
  }

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
    if (item.type === 'whisper' || item.type === 'tts') {
      // The file's row in Voice → Model files scrolls into view and flashes.
      setVoiceHighlight({ id: `voice-file-${item.type}-${item.id}`, at: Date.now() });
      setActiveTab('audio');
      return;
    }
    if (item.type === 'image') {
      // The file's row in Images → Model files scrolls into view and flashes.
      setImageHighlight({ id: `image-file-${item.id}`, at: Date.now() });
      setActiveTab('image');
      return;
    }
    window.setTimeout(() => {
      const id = item.type === 'model' ? `model-card-${item.id}` : `provider-card-${item.id}`;
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
    setRefreshCount((count) => count + 1);
  };

  // Plain words: each page says what it needs itself.
  const tabItems = [
    { value: 'chat', label: 'Language' },
    { value: 'audio', label: 'Voice' },
    { value: 'image', label: 'Images' },
    { value: 'usage', label: 'Usage' },
    { value: 'training', label: 'Training' },
  ];

  const viewItems = [
    { value: 'connected', label: 'Connected', meta: providerProfiles.length ? String(providerProfiles.length) : null },
    { value: 'add', label: 'Add provider' },
    { value: 'local', label: 'Local models', meta: models.length ? String(models.length) : null },
  ];

  const makeLocalDefault = (model) => {
    if (model.engineType === 'mlx') {
      // MLX models start from their card, which handles the separate server.
      setHighlightedItem({ type: 'model', id: model.id || model.filename });
      setActiveView('local');
      return;
    }
    handleMakeLocalDefault(model.path || model.filename);
  };

  const downloadHub = (
    <ModelDownloadHub
      searchQuery={searchQuery}
      downloadedMatches={downloadedMatches}
      onSearchQueryChange={setSearchQuery}
      onDownloadedSelect={handleDownloadedSelect}
      onModelRefresh={loadModelList}
    />
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full flex-col bg-canvas text-fg dark:scheme-dark">
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
        <div ref={tabRowRef} className="mx-auto mt-4 max-w-5xl">
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
            <TrainingPage refreshKey={refreshCount} />
          </Suspense>
        </div>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-6 lg:px-10">
            {deleteError ? (
              <Notice tone="error" action={<IconButton icon={X} label="Dismiss" size="sm" onClick={() => setDeleteError('')} />}>
                {deleteError}
              </Notice>
            ) : null}

            {activeTab === 'chat' && (
              <>
                <ActiveBrainPanel
                  loading={(!providerConfig && loadingProviders) || (!serverStatus && loadingStatus)}
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
                  refreshKey={refreshCount}
                  profiles={providerProfiles}
                  localModels={models}
                  onStop={handleStop}
                  onDeactivateProvider={handleProviderDeactivate}
                  onActivateProfile={(profile) => handleProviderActivate(profile.id, false)}
                  onMakeLocalDefault={makeLocalDefault}
                  onBrowseProviders={() => setActiveView('add')}
                />

                <div ref={viewSwitchRef}>
                  <Segmented value={activeView} onChange={setActiveView} items={viewItems} label="Language model sources" className="max-w-full overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap" />
                </div>

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
                    onSave={handleProviderSave}
                    onDelete={handleProviderDelete}
                    onTest={handleProviderTest}
                    onActivate={handleProviderActivate}
                    onLoadModels={handleLoadProviderModels}
                  />
                )}
              </>
            )}

            {activeTab === 'audio' && <VoicePage highlight={voiceHighlight} refreshKey={refreshCount} />}

            {activeTab === 'image' && <ImagesPage highlight={imageHighlight} refreshKey={refreshCount} />}

            {activeTab === 'usage' && (
              <ModelUsageSection
                usage={modelUsage}
                loading={loadingUsage}
                error={usageError}
                range={usageRange}
                onRangeChange={setUsageRange}
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
