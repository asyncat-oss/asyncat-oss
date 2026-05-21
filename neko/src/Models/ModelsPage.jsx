/* eslint-disable react/prop-types */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw, TriangleAlert, X,
  Mic, Volume2, Cpu, Eye, Image, MessageSquare, BarChart3
} from 'lucide-react';
import ActiveBrainPanel from './ActiveBrainPanel.jsx';
import ProvidersSection from './ProvidersSection.jsx';
import LocalModelsPane from './LocalModelsPane.jsx';
import AudioModelsSection from './AudioModelsSection.jsx';
import VisualModelsSection from './VisualModelsSection.jsx';
import CapabilityProvidersSection from './CapabilityProvidersSection.jsx';
import ModelUsageSection from './ModelUsageSection.jsx';
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx';
import ModelDownloadHub from './ModelDownloadHub.jsx';
import {
  Badge, STATUS_META, conciseHardwareSummary,
  providerLabel
} from './modelPageShared.jsx';
import { useModelsPageController } from './useModelsPageController.js';
import { audioApi, visualModelsApi, aiProviderApi } from '../Settings/settingApi.js';

// ── Status dot ────────────────────────────────────────────────────────────────
const StatusDot = ({ status }) => {
  const cls = {
    ready:   'bg-green-500',
    loading: 'bg-amber-400 animate-pulse',
    error:   'bg-red-500',
    idle:    'bg-gray-300 dark:bg-gray-600 midnight:bg-gray-600',
  }[status] ?? 'bg-gray-300 dark:bg-gray-600 midnight:bg-gray-600';
  return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${cls}`} />;
};

// ── Tabbed page shell ────────────────────────────────────────────────────────
const TabButton = ({ icon: Icon, label, meta, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:justify-start ${
      active
        ? 'bg-gray-950 text-white shadow-sm dark:bg-gray-100 dark:text-gray-950 midnight:bg-slate-800 midnight:text-slate-100 midnight:ring-1 midnight:ring-slate-700'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:text-slate-400 midnight:hover:bg-slate-800 midnight:hover:text-slate-100'
    }`}
  >
    <Icon className="h-4 w-4 flex-shrink-0" />
    <span className="truncate">{label}</span>
    {meta && (
      <span className={`hidden rounded-md px-1.5 py-0.5 text-[10px] font-semibold sm:inline-flex ${
        active
          ? 'bg-white/15 text-white dark:bg-gray-950/10 dark:text-gray-700 midnight:bg-slate-700 midnight:text-slate-200'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 midnight:bg-slate-900 midnight:text-slate-400'
      }`}>
        {meta}
      </span>
    )}
  </button>
);

const TabHeader = ({ icon: Icon, title, subtitle, badge }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 midnight:border-slate-800 midnight:bg-slate-900 midnight:text-slate-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-950 dark:text-white midnight:text-slate-100">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400 midnight:text-slate-400">{subtitle}</p>
        )}
      </div>
    </div>
    {badge}
  </div>
);

// ── Speech compact subtitles ─────────────────────────────────────────────────
const SpeechSubtitle = ({ status, model, loaded, idleLabel }) => {
  if (!loaded) return 'Checking...';
  if (status === 'ready') return model || 'Active local model';
  if (status === 'loading') return 'Loading local model...';
  if (status === 'error') return 'Needs attention';
  return idleLabel;
};

const SpeechCompactBadge = ({ status, label }) => (
  <span className="flex items-center gap-1.5">
    <StatusDot status={status} />
    <span className="text-[10px] text-gray-500 dark:text-gray-400 midnight:text-gray-400">{label}</span>
  </span>
);

const AssetSubtitle = ({ count, emptyLabel, singularLabel, pluralLabel }) => {
  if (!count) return emptyLabel;
  return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
};

// ── Main page ─────────────────────────────────────────────────────────────────
const ModelsPage = () => {
  const {
    modelContextConfig, serverStatus, setServerStatus,
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
  } = useModelsPageController();

  // ── Derived state ──────────────────────────────────────────────────────────
  const status = serverStatus?.status ?? 'idle';
  const { label: statusLabel, color: statusColor } = STATUS_META[status] || STATUS_META.idle;
  const isRunning = status === 'ready' || status === 'loading';
  const isReady = status === 'ready';
  const iconClass = {
    ready:   'text-green-600 dark:text-green-400 midnight:text-green-400',
    loading: 'text-amber-600 dark:text-amber-400 midnight:text-amber-400 animate-pulse',
    error:   'text-red-500 midnight:text-red-400',
    idle:    'text-gray-400 midnight:text-slate-500',
  }[status] ?? 'text-gray-400 midnight:text-slate-500';

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
  const [visualModels, setVisualModels] = useState({ vision: [], image: [] });
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
          vision: modelsRes.vision || [],
          image: modelsRes.image || [],
        });
      })
      .catch(() => setVisualModels({ vision: [], image: [] }));
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
  const [activeTab, setActiveTab] = useState('chat');

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
    for (const m of visualModels.vision) {
      const haystack = [m.name, m.filename, m.assetKind, 'vision multimodal projector mmproj'].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) continue;
      matches.push({
        type: 'vision',
        category: 'vision',
        id: m.id || m.filename,
        name: m.name || m.filename,
        detail: [m.assetKind, m.sizeFormatted].filter(Boolean).join(' · '),
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
  }, [audioModels.tts, audioModels.whisper, models, searchQuery, visualModels.image, visualModels.vision, providerProfiles, providerCatalog, status, serverStatus, providerConfig]);

  const handleDownloadedSelect = (item) => {
    setHighlightedItem(item);
    if (item.type === 'model' || item.type === 'provider') setActiveTab('chat');
    if (item.type === 'whisper' || item.type === 'tts') setActiveTab('audio');
    if (item.type === 'vision') setActiveTab('vision');
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
  const chatReady = status === 'ready' || Boolean(providerConfig?.model);
  const usageRequestCount = modelUsage?.totals?.request_count || 0;
  const usageTokensK = Math.round((modelUsage?.totals?.total_tokens || 0) / 1000);

  const audioMeta = (() => {
    if (!voiceState.loaded) return audioAssetCount ? String(audioAssetCount) : null;
    if (voiceState.sttStatus === 'error' || voiceState.ttsStatus === 'error') return 'Error';
    if (voiceState.sttStatus === 'ready' || voiceState.ttsStatus === 'ready') return 'Active';
    return audioAssetCount ? String(audioAssetCount) : null;
  })();

  const tabItems = [
    { key: 'chat', label: 'LLM', icon: MessageSquare, meta: chatReady ? 'Active' : String(providerProfiles.length + models.length) },
    { key: 'audio', label: 'Audio', icon: Mic, meta: audioMeta },
    { key: 'vision', label: 'Vision', icon: Eye, meta: visualModels.vision.length ? String(visualModels.vision.length) : null },
    { key: 'image', label: 'Image', icon: Image, meta: visualModels.image.length ? String(visualModels.image.length) : null },
    { key: 'usage', label: 'Usage', icon: BarChart3, meta: usageRequestCount ? String(usageRequestCount) : usageRange },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div data-models-page className="flex h-full w-full flex-col bg-white text-gray-950 dark:bg-gray-900 dark:text-gray-100 midnight:bg-slate-950 midnight:text-slate-100 font-sans">
      <ConfirmDeleteDialog
        model={deleteConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200/80 bg-white dark:border-gray-800/80 dark:bg-gray-900 midnight:border-slate-800/80 midnight:bg-slate-950">
        <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 pt-5 pb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                <Cpu className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100 leading-none">
                  Models
                </h1>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <StatusDot status={status} />
                  <span>{statusLabel}</span>
                  {serverStatus?.model && (
                    <>
                      <span className="text-gray-300 dark:text-gray-700">·</span>
                      <span className="text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{serverStatus.model}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isLoading || isBusy}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:border-slate-800 midnight:bg-slate-900 midnight:text-slate-400 midnight:hover:bg-slate-800 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Delete error banner */}
        {deleteError && (
          <div className="mx-auto max-w-[1200px] px-6 lg:px-8 mt-4">
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm shadow-sm">
              <div className="flex-shrink-0 w-6 h-6 rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <TriangleAlert size={14} className="text-red-500" />
              </div>
              <span className="flex-1 text-gray-700 dark:text-gray-200">{deleteError}</span>
              <button onClick={() => setDeleteError('')} className="hover:opacity-70 text-gray-400"><X size={13} /></button>
            </div>
          </div>
        )}

        <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-8 py-6 space-y-4">

          {/* ── Brain ─────────────────────────────────────────────────────── */}
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
            voiceState={voiceState}
            visualModels={visualModels}
            usageRequestCount={usageRequestCount}
            usageTokensK={usageTokensK}
            onStop={handleStop}
            onDeactivateProvider={handleProviderDeactivate}
          />

          <ModelDownloadHub
            searchQuery={searchQuery}
            downloadedMatches={downloadedMatches}
            onSearchQueryChange={setSearchQuery}
            onDownloadedSelect={handleDownloadedSelect}
            onModelRefresh={loadModelList}
            onAudioRefresh={refreshVoiceData}
            onVisualRefresh={refreshVisualData}
          />

          <div className="sticky top-0 z-20 -mx-6 border-y border-gray-200/80 bg-white/95 px-6 py-3 backdrop-blur dark:border-gray-800/80 dark:bg-gray-900/95 midnight:border-slate-800/80 midnight:bg-slate-950/95 lg:-mx-8 lg:px-8">
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {tabItems.map((item) => (
                <TabButton
                  key={item.key}
                  icon={item.icon}
                  label={item.label}
                  meta={item.meta}
                  active={activeTab === item.key}
                  onClick={() => setActiveTab(item.key)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {activeTab === 'chat' && (
              <>
                <TabHeader
                  icon={MessageSquare}
                  title="Language Models"
                  subtitle={`${providerProfiles.length} provider profile${providerProfiles.length === 1 ? '' : 's'} · ${models.length} local LLM${models.length === 1 ? '' : 's'}${activeProviderName ? ` · ${activeProviderName} active` : ''}`}
                  badge={<Badge color={chatReady ? 'green' : 'gray'}>{chatReady ? 'Active' : 'Choose one'}</Badge>}
                />
                <div className="space-y-8">
                  <ProvidersSection
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
              </>
            )}

            {activeTab === 'audio' && (
              <>
                <TabHeader
                  icon={Mic}
                  title="Audio Models"
                  subtitle={`${SpeechSubtitle({
                    status: voiceState.sttStatus,
                    model: voiceState.sttModel,
                    loaded: voiceState.loaded,
                    idleLabel: 'Speech-to-text idle',
                  })} · ${SpeechSubtitle({
                    status: voiceState.ttsStatus,
                    model: voiceState.ttsModel,
                    loaded: voiceState.loaded,
                    idleLabel: 'Text-to-speech idle',
                  })}`}
                  badge={<div className="flex items-center gap-3"><SpeechCompactBadge status={voiceState.sttStatus} label="STT" /><SpeechCompactBadge status={voiceState.ttsStatus} label="TTS" /></div>}
                />
                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="space-y-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-slate-200">
                      <Mic className="h-4 w-4 text-gray-400" />
                      Speech-to-Text
                    </div>
                    <CapabilityProvidersSection capability="stt" />
                    <AudioModelsSection
                      mode="whisper"
                      highlightedItem={highlightedItem}
                      onModelsChange={setAudioModels}
                    />
                  </div>
                  <div className="space-y-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-slate-200">
                      <Volume2 className="h-4 w-4 text-gray-400" />
                      Text-to-Speech
                    </div>
                    <CapabilityProvidersSection capability="tts" />
                    <AudioModelsSection
                      mode="tts"
                      highlightedItem={highlightedItem}
                      onModelsChange={setAudioModels}
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'vision' && (
              <>
                <TabHeader
                  icon={Eye}
                  title="Vision Models"
                  subtitle={AssetSubtitle({
                    count: visualModels.vision.length,
                    emptyLabel: 'No vision assets',
                    singularLabel: 'vision asset',
                    pluralLabel: 'vision assets',
                  })}
                  badge={visualModels.vision.length > 0 ? <Badge color="gray">{visualModels.vision.length} asset{visualModels.vision.length === 1 ? '' : 's'}</Badge> : null}
                />
                <div className="space-y-5">
                  <CapabilityProvidersSection capability="vision" />
                  <VisualModelsSection
                    mode="vision"
                    highlightedItem={highlightedItem}
                    onModelsChange={setVisualModels}
                  />
                </div>
              </>
            )}

            {activeTab === 'image' && (
              <>
                <TabHeader
                  icon={Image}
                  title="Image Generation"
                  subtitle={AssetSubtitle({
                    count: visualModels.image.length,
                    emptyLabel: 'No image generation assets',
                    singularLabel: 'image asset',
                    pluralLabel: 'image assets',
                  })}
                  badge={visualModels.image.length > 0 ? <Badge color="gray">{visualModels.image.length} asset{visualModels.image.length === 1 ? '' : 's'}</Badge> : null}
                />
                <div className="space-y-5">
                  <CapabilityProvidersSection capability="image" />
                  <VisualModelsSection
                    mode="image"
                    highlightedItem={highlightedItem}
                    onModelsChange={setVisualModels}
                  />
                </div>
              </>
            )}

            {activeTab === 'usage' && (
              <>
                <TabHeader
                  icon={BarChart3}
                  title="Usage"
                  subtitle={modelUsage?.totals?.request_count
                    ? `${modelUsage.totals.request_count} request${modelUsage.totals.request_count === 1 ? '' : 's'} · ${Math.round((modelUsage.totals.total_tokens || 0) / 1000)}k tokens`
                    : 'No usage recorded yet'}
                  badge={<Badge color={modelUsage?.totals?.request_count ? 'blue' : 'gray'}>{usageRange}</Badge>}
                />
                <ModelUsageSection
                  usage={modelUsage}
                  loading={loadingUsage}
                  error={usageError}
                  range={usageRange}
                  onRangeChange={setUsageRange}
                  onRefresh={refreshUsageData}
                  catalog={providerCatalog}
                />
              </>
            )}

          </div>

        </div>
      </div>
    </div>
  );
};

export default ModelsPage;
