/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import {
  Check, ChevronDown, ChevronUp, Cpu, Download, HardDrive, RefreshCw,
  RotateCcw, Settings2, TerminalSquare, TriangleAlert, Wrench, Zap,
} from 'lucide-react';
import { Badge } from './modelPageShared.jsx';

const INSTALL_PROFILE_LABELS = {
  cpu_safe: 'CPU-safe build',
  nvidia_gpu: 'NVIDIA CUDA build',
  apple_metal: 'Apple Metal build',
  amd_rocm: 'AMD ROCm build',
};

const capabilityBadgeColor = (hint) => {
  if (hint === 'nvidia') return 'green';
  if (hint === 'apple') return 'blue';
  if (hint === 'amd') return 'amber';
  return 'gray';
};

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(unit === 0 ? 0 : 1) : value.toFixed(2)} ${units[unit]}`;
};

const readableRuntime = (candidate) => (
  candidate?.runtime === 'python' ? 'llama-cpp-python' : 'llama.cpp'
);

const engineKey = (candidate) => (
  candidate ? `${candidate.runtime}:${candidate.path}` : ''
);

const engineTitle = (candidate) => {
  if (!candidate) return 'No runtime selected';
  if (candidate.managed) return `Asyncat ${readableRuntime(candidate)}`;
  return readableRuntime(candidate);
};

const hardwareSummary = (hardware) => {
  const gpu = hardware?.gpu;
  if (!gpu) return `${hardware?.platform || 'unknown'} / ${hardware?.arch || 'unknown'} / CPU`;
  const vram = gpu.vramGb ? ` / ${gpu.vramGb} GB VRAM` : '';
  return `${hardware?.platform || 'unknown'} / ${hardware?.arch || 'unknown'} / ${gpu.vendor} ${gpu.name}${vram}`;
};

const installStatusTone = (status) => {
  if (status === 'error') return 'red';
  if (status === 'complete') return 'green';
  if (status === 'queued' || status === 'running') return 'blue';
  return 'gray';
};

const recommendationCopy = (recommendation, current, hardware) => {
  if (!recommendation) return 'Runtime detection has not finished yet.';
  if (recommendation.state === 'current_ok') {
    return current
      ? 'The selected runtime matches this machine.'
      : 'No local runtime is selected yet.';
  }
  if (recommendation.state === 'recommended_available') {
    return 'A better runtime is installed and ready to switch to.';
  }
  if (hardware?.gpu) {
    return 'GPU hardware was detected, but a matching runtime is not installed yet.';
  }
  return 'CPU-safe runtime is the recommended default for this machine.';
};

const SettingGroup = ({ children, className = '' }) => (
  <section className={`overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950 ${className}`}>
    {children}
  </section>
);

const SettingRow = ({ label, detail, children, divider = true }) => (
  <div className={`grid gap-3 px-4 py-4 sm:grid-cols-[minmax(150px,240px)_1fr] sm:items-center ${divider ? 'border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800' : ''}`}>
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100">{label}</p>
      {detail && (
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">{detail}</p>
      )}
    </div>
    <div className="min-w-0 sm:justify-self-end">{children}</div>
  </div>
);

const StatusNote = ({ tone = 'gray', children }) => {
  const tones = {
    gray: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 midnight:border-slate-800 midnight:bg-slate-900 midnight:text-slate-300',
    red: 'border-red-100 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300',
    green: 'border-green-100 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300',
    amber: 'border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200',
    blue: 'border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone] || tones.gray}`}>
      {children}
    </div>
  );
};

const EngineRuntimeSection = ({
  engineData,
  engineCatalog,
  loadingCatalog = false,
  installJob,
  loading = false,
  switchingKey = null,
  installingKey = null,
  switchError = '',
  switchSuccess = '',
  installError = '',
  installSuccess = '',
  revertSelection = null,
  retryModel = null,
  pythonInstallJob = null,
  pythonBuildError = '',
  pythonBuildSuccess = '',
  onRescan,
  onSwitch,
  onInstall,
  onBuildGpuRuntime,
  onRefreshCatalog,
  installReadiness = null,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customRuntime, setCustomRuntime] = useState('binary');
  const [customPath, setCustomPath] = useState('');

  const recommendation = engineData?.recommendation || null;
  const current = engineData?.current || null;
  const candidates = engineData?.candidates || [];
  const releases = useMemo(() => engineCatalog?.releases || [], [engineCatalog]);
  const canRetry = Boolean(retryModel);
  const actionError = switchError || installError || pythonBuildError;
  const actionSuccess = switchSuccess || installSuccess || pythonBuildSuccess;
  const activeInstallJob = installJob || engineCatalog?.activeJob || null;
  const activeBuildJob = pythonInstallJob || null;

  const recommendationCandidate = candidates.find(candidate => candidate.id === recommendation?.recommendedCandidateId) || null;
  const installProfile = INSTALL_PROFILE_LABELS[recommendation?.recommendedInstallProfile]
    ? recommendation.recommendedInstallProfile
    : null;

  const bestManagedAsset = useMemo(() => {
    if (!installProfile) return null;
    for (const release of releases) {
      const asset = release.assets?.find(item => item.compatible && item.supportedProfiles?.includes(installProfile));
      if (asset) return { release, asset };
    }
    return null;
  }, [installProfile, releases]);

  const primaryAction = useMemo(() => {
    if (recommendationCandidate && !recommendationCandidate.isCurrent) {
      return {
        key: engineKey(recommendationCandidate),
        label: 'Switch',
        icon: Zap,
        onClick: () => onSwitch?.({
          runtime: recommendationCandidate.runtime,
          path: recommendationCandidate.path,
        }, false),
      };
    }
    if (bestManagedAsset) {
      return {
        key: `install:${installProfile}`,
        label: 'Install',
        icon: Download,
        onClick: () => onInstall?.({
          profile: installProfile,
          releaseTag: bestManagedAsset.release.tagName,
          assetName: bestManagedAsset.asset.name,
        }, false),
      };
    }
    return null;
  }, [bestManagedAsset, installProfile, onInstall, onSwitch, recommendationCandidate]);

  const selectableCandidates = candidates.length > 0 ? candidates : (current ? [current] : []);
  const currentKey = engineKey(current);
  const mlxAvailable = engineData?.hardware?.platform === 'darwin'
    && (engineData?.hardware?.arch === 'arm64' || engineData?.hardware?.gpu?.vendor === 'Apple');
  const relevantToolIds = useMemo(() => {
    const ids = new Set();
    if (bestManagedAsset) {
      const name = String(bestManagedAsset.asset?.name || '').toLowerCase();
      if (name.endsWith('.zip')) ids.add('unzip');
      if (name.endsWith('.tar') || name.endsWith('.tgz') || name.endsWith('.tar.gz')) ids.add('tar');
    } else if (installProfile) {
      ids.add('python');
      ids.add('cxx-compiler');
    }
    return ids;
  }, [bestManagedAsset, installProfile]);
  const missingRuntimeTools = (installReadiness?.checks || [])
    .filter(check => relevantToolIds.has(check.id) && !check.ok)
    .slice(0, 5);
  const installCommand = installReadiness?.commands?.[0]?.command || '';
  const jobStatus = activeBuildJob?.status || activeInstallJob?.status;
  const jobMessage = activeBuildJob?.message || activeInstallJob?.message || jobStatus;
  const jobProgress = activeBuildJob?.progress ?? activeBuildJob?.percent ?? activeInstallJob?.progress ?? activeInstallJob?.percent ?? 0;
  const PrimaryActionIcon = primaryAction?.icon;

  const submitCustom = (retry = false) => {
    const path = customPath.trim();
    if (!path) return;
    onSwitch?.({ runtime: customRuntime, path }, retry);
  };

  const handleEngineSelect = (event) => {
    const selected = selectableCandidates.find(candidate => engineKey(candidate) === event.target.value);
    if (!selected || selected.isCurrent) return;
    onSwitch?.({ runtime: selected.runtime, path: selected.path }, false);
  };

  return (
    <div className="space-y-5">
      <SettingGroup>
        <div className="flex flex-col gap-4 border-b border-gray-100 px-4 py-4 dark:border-gray-800 midnight:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white dark:bg-gray-100 dark:text-gray-950 midnight:bg-slate-800 midnight:text-slate-100">
              <Cpu className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100">
                Runtime selections
              </h3>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                {recommendationCopy(recommendation, current, engineData?.hardware)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {current?.capabilityLabel && (
              <Badge color={capabilityBadgeColor(current.capabilityHint)}>{current.capabilityLabel}</Badge>
            )}
            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={Boolean(switchingKey) || Boolean(installingKey)}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-950 dark:hover:bg-gray-200 midnight:bg-slate-800 midnight:text-slate-100 midnight:ring-1 midnight:ring-slate-700"
              >
                {PrimaryActionIcon && <PrimaryActionIcon className={`h-3.5 w-3.5 ${switchingKey === primaryAction.key || installingKey === primaryAction.key ? 'animate-spin' : ''}`} />}
                {primaryAction.label} recommended
              </button>
            )}
            <button
              type="button"
              onClick={() => onRescan?.({ clearActions: true })}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 midnight:border-slate-700 midnight:bg-slate-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Rescan
            </button>
          </div>
        </div>

        <SettingRow
          label="GGUF"
          detail={current?.path ? current.path : 'Used by downloaded llama.cpp models.'}
        >
          <select
            value={currentKey}
            onChange={handleEngineSelect}
            disabled={selectableCandidates.length === 0 || Boolean(switchingKey) || Boolean(installingKey)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none transition focus:border-gray-400 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 midnight:border-slate-700 midnight:bg-slate-950 sm:w-[360px]"
          >
            {selectableCandidates.length === 0 && <option value="">Not detected</option>}
            {selectableCandidates.map(candidate => (
              <option key={candidate.id || engineKey(candidate)} value={engineKey(candidate)}>
                {engineTitle(candidate)} - {candidate.capabilityLabel || 'Runtime'}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow
          label="MLX"
          detail="Used by Apple Silicon MLX model folders."
          divider={false}
        >
          <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 midnight:border-slate-700 midnight:bg-slate-950 sm:w-[360px]">
            <span className="truncate font-medium text-gray-800 dark:text-gray-100 midnight:text-slate-100">
              {mlxAvailable ? 'MLX runtime' : 'Not supported on this machine'}
            </span>
            <Badge color={mlxAvailable ? 'blue' : 'gray'}>{mlxAvailable ? 'Available' : 'System'}</Badge>
          </div>
        </SettingRow>
      </SettingGroup>

      {actionError && (
        <StatusNote tone="red">
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{actionError}</span>
          </span>
        </StatusNote>
      )}
      {actionSuccess && <StatusNote tone="green">{actionSuccess}</StatusNote>}

      {jobStatus && (
        <SettingGroup>
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100">
                  {activeBuildJob ? 'Building runtime' : 'Installing runtime'}
                </p>
                <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">{jobMessage}</p>
              </div>
              <Badge color={installStatusTone(jobStatus)}>{jobStatus}</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${Math.max(5, Math.min(100, jobProgress || 0))}%` }}
              />
            </div>
          </div>
        </SettingGroup>
      )}

      <SettingGroup>
        <SettingRow
          label="Runtime updates"
          detail={bestManagedAsset ? `${bestManagedAsset.release.tagName} / ${formatBytes(bestManagedAsset.asset.size)}` : 'Stable channel for managed runtime packages.'}
        >
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onRefreshCatalog?.(true)}
              disabled={loadingCatalog}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingCatalog ? 'animate-spin' : ''}`} />
              Check for updates
            </button>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300">
              Stable
            </div>
          </div>
        </SettingRow>

        {bestManagedAsset && (
          <SettingRow
            label={INSTALL_PROFILE_LABELS[installProfile]}
            detail={bestManagedAsset.asset.name}
            divider={false}
          >
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onInstall?.({
                  profile: installProfile,
                  releaseTag: bestManagedAsset.release.tagName,
                  assetName: bestManagedAsset.asset.name,
                }, false)}
                disabled={Boolean(installingKey)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Download className="h-3.5 w-3.5" />
                Install
              </button>
              <button
                type="button"
                onClick={() => onInstall?.({
                  profile: installProfile,
                  releaseTag: bestManagedAsset.release.tagName,
                  assetName: bestManagedAsset.asset.name,
                }, true)}
                disabled={!canRetry || Boolean(installingKey)}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-950"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Install and retry
              </button>
            </div>
          </SettingRow>
        )}

        {installProfile && !bestManagedAsset && (
          <SettingRow
            label={`Build ${INSTALL_PROFILE_LABELS[installProfile]}`}
            detail="No managed download matched this machine, but Asyncat can try a local build."
            divider={false}
          >
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onBuildGpuRuntime?.(installProfile, false)}
                disabled={Boolean(activeBuildJob)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <TerminalSquare className="h-3.5 w-3.5" />
                Build
              </button>
              <button
                type="button"
                onClick={() => onBuildGpuRuntime?.(installProfile, true)}
                disabled={!canRetry || Boolean(activeBuildJob)}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-950"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Build and retry
              </button>
            </div>
          </SettingRow>
        )}
      </SettingGroup>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">Engines and frameworks</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">{hardwareSummary(engineData?.hardware)}</span>
        </div>
        <SettingGroup>
          {candidates.length === 0 && (
            <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              No local chat runtimes were detected yet.
            </div>
          )}
          {candidates.map((candidate, index) => {
            const key = engineKey(candidate);
            return (
              <div
                key={candidate.id || key}
                className={`grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-center ${index < candidates.length - 1 ? 'border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800' : ''}`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800 midnight:bg-slate-900 midnight:ring-slate-800">
                    {candidate.runtime === 'python' ? <Settings2 className="h-4 w-4" /> : <HardDrive className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100">{engineTitle(candidate)}</p>
                      {candidate.isCurrent && <Badge color="green">Selected</Badge>}
                      {candidate.isRecommended && <Badge color="amber">Recommended</Badge>}
                      {candidate.managed && <Badge color="gray">Managed</Badge>}
                      <Badge color={capabilityBadgeColor(candidate.capabilityHint)}>{candidate.capabilityLabel}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">{candidate.source || 'Detected runtime'}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">{candidate.path}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {candidate.isCurrent ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-green-700 dark:text-green-300">
                      <Check className="h-3.5 w-3.5" />
                      Active
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSwitch?.({ runtime: candidate.runtime, path: candidate.path }, false)}
                      disabled={Boolean(switchingKey) || Boolean(installingKey)}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      {switchingKey === key ? 'Switching...' : 'Switch'}
                    </button>
                  )}
                  {!candidate.isCurrent && canRetry && (
                    <button
                      type="button"
                      onClick={() => onSwitch?.({ runtime: candidate.runtime, path: candidate.path }, true)}
                      disabled={Boolean(switchingKey) || Boolean(installingKey)}
                      className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-950"
                    >
                      Retry model
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </SettingGroup>
      </div>

      {missingRuntimeTools.length > 0 && (
        <StatusNote tone="amber">
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span className="min-w-0">
              Missing runtime tools: {missingRuntimeTools.map(item => item.id).join(', ')}
              {installCommand && (
                <span className="mt-1 block truncate font-mono text-xs">{installCommand}</span>
              )}
            </span>
          </span>
        </StatusNote>
      )}

      <SettingGroup>
        <button
          type="button"
          onClick={() => setShowAdvanced(value => !value)}
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800">
              <Wrench className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100">Advanced runtime tools</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">Custom paths, retry actions, and recovery.</span>
            </span>
          </span>
          {showAdvanced ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>

        {showAdvanced && (
          <div className="border-t border-gray-100 px-4 py-4 dark:border-gray-800 midnight:border-slate-800">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_auto]">
              <select
                value={customRuntime}
                onChange={(event) => setCustomRuntime(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
              >
                <option value="binary">Binary</option>
                <option value="python">Python</option>
              </select>
              <input
                value={customPath}
                onChange={(event) => setCustomPath(event.target.value)}
                placeholder={customRuntime === 'python' ? '/path/to/python' : '/path/to/llama-server'}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => submitCustom(false)}
                  disabled={!customPath.trim() || Boolean(switchingKey) || Boolean(installingKey)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Switch
                </button>
                <button
                  type="button"
                  onClick={() => submitCustom(true)}
                  disabled={!customPath.trim() || !canRetry || Boolean(switchingKey) || Boolean(installingKey)}
                  className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-950"
                >
                  Retry
                </button>
              </div>
            </div>

            {revertSelection && (
              <button
                type="button"
                onClick={() => onSwitch?.(revertSelection, false)}
                disabled={Boolean(switchingKey) || Boolean(installingKey)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/20"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Revert to previous engine
              </button>
            )}
          </div>
        )}
      </SettingGroup>
    </div>
  );
};

export default EngineRuntimeSection;
