// The llama.cpp engine behind downloaded language models (Models → Local
// models → Engine): which build runs them, managed builds to install, update
// or remove, every engine found on this computer, and one set by its path.

import { useMemo, useState } from 'react';
import {
  CheckCircle2, ChevronDown, Download, HardDrive, RefreshCw,
  ArrowLeftRight, RotateCcw, Settings2, TerminalSquare, Trash2,
} from 'lucide-react';
import { Badge } from './modelPageShared.jsx';
import Button from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import { Progress } from '../components/ui/Progress.jsx';
import Select from '../components/ui/Select.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { downloadProgressText, formatBytes } from './engineProgress.js';
import { buildsBehind, buildsNewerText, profileForCapability } from './engineVersions.js';
import { gpuName } from '../welcome/setupFlow.js';

const INSTALL_PROFILE_LABELS = {
  cpu_safe: 'CPU-safe build',
  nvidia_gpu: 'NVIDIA CUDA build',
  apple_metal: 'Apple Metal build',
  amd_rocm: 'AMD ROCm build',
  vulkan: 'Vulkan build',
  intel_sycl: 'Intel (SYCL) build',
};

const INSTALL_PROFILE_ORDER = ['cpu_safe', 'apple_metal', 'nvidia_gpu', 'amd_rocm', 'vulkan', 'intel_sycl'];

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

const PLATFORM_NAMES = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' };

// "Linux · x64 · NVIDIA GeForce RTX 4050 Laptop GPU · 6 GB", in the app's
// separators, naming the vendor once.
const hardwareSummary = (hardware) => {
  const platform = PLATFORM_NAMES[hardware?.platform] || hardware?.platform || 'Unknown system';
  const gpu = hardware?.gpu;
  return [
    platform,
    hardware?.arch || null,
    gpu ? gpuName(gpu) : 'Processor only',
    gpu?.vramGb ? `${gpu.vramGb} GB` : null,
  ].filter(Boolean).join(' · ');
};

const installStatusTone = (status) => {
  if (status === 'error') return 'red';
  if (status === 'complete') return 'green';
  return 'gray';
};

const recommendationCopy = (recommendation, current, hardware) => {
  if (!recommendation) return 'Runtime detection has not finished yet.';
  // The GPU's driver isn't answering: no runtime fixes that, so pass on the
  // backend's explanation instead of suggesting an install.
  if (recommendation.kind === 'gpu_driver_issue') return recommendation.body;
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

// Rows in one bordered box, with lines between them.
const SettingGroup = ({ children, className = '' }) => (
  <section className={`divide-y divide-line rounded-xl border border-line ${className}`}>
    {children}
  </section>
);

const CUSTOM_RUNTIMES = [
  { value: 'binary', label: 'Binary' },
  { value: 'python', label: 'Python' },
];

const SettingRow = ({ label, detail, children }) => (
  <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(150px,240px)_1fr] sm:items-center">
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-fg">{label}</p>
      {detail && (
        <p className="mt-0.5 break-words text-[12px] leading-5 text-fg-muted">{detail}</p>
      )}
    </div>
    <div className="min-w-0 sm:justify-self-end">{children}</div>
  </div>
);

// A finished action: a light green line with a check.
const SuccessNote = ({ children }) => (
  <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-700 dark:text-emerald-400">
    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span className="min-w-0">{children}</span>
  </p>
);

const EngineRuntimeSection = ({
  engineData,
  mlxStatus = null,
  engineCatalog,
  loadingCatalog = false,
  installJob,
  loading = false,
  switchingKey = null,
  installingKey = null,
  removingKey = null,
  switchError = '',
  switchSuccess = '',
  installError = '',
  installSuccess = '',
  installNotice = '',
  removeError = '',
  removeSuccess = '',
  revertSelection = null,
  retryModel = null,
  pythonInstallJob = null,
  pythonBuildError = '',
  pythonBuildSuccess = '',
  onRescan,
  onSwitch,
  onInstall,
  onCancelInstall,
  onCancelBuild,
  onBuildGpuRuntime,
  onRemoveManagedEngine,
  onRefreshCatalog,
  installReadiness = null,
}) => {
  const confirm = useConfirm();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customRuntime, setCustomRuntime] = useState('binary');
  const [customPath, setCustomPath] = useState('');

  const recommendation = engineData?.recommendation || null;
  const current = engineData?.current || null;
  const candidates = useMemo(() => engineData?.candidates || [], [engineData?.candidates]);
  const releases = useMemo(() => engineCatalog?.releases || [], [engineCatalog]);
  const latestBuild = engineCatalog?.latestBuild || null;
  const canRetry = Boolean(retryModel);
  const actionError = switchError || installError || pythonBuildError || removeError;
  const actionSuccess = switchSuccess || installSuccess || pythonBuildSuccess || removeSuccess;
  const activeInstallJob = installJob || engineCatalog?.activeJob || null;
  const activeBuildJob = pythonInstallJob || null;

  const recommendationCandidate = candidates.find(candidate => candidate.id === recommendation?.recommendedCandidateId) || null;
  const installProfile = INSTALL_PROFILE_LABELS[recommendation?.recommendedInstallProfile]
    ? recommendation.recommendedInstallProfile
    : null;

  const managedAssetsByProfile = useMemo(() => {
    const map = new Map();
    for (const profile of INSTALL_PROFILE_ORDER) {
      for (const release of releases) {
        const asset = release.assets?.find(item => item.compatible && item.supportedProfiles?.includes(profile));
        if (asset) {
          map.set(profile, { profile, release, asset });
          break;
        }
      }
    }
    return map;
  }, [releases]);
  const bestManagedAsset = installProfile ? managedAssetsByProfile.get(installProfile) || null : null;
  const installedManagedProfiles = useMemo(() => {
    const map = new Map();
    for (const candidate of [current, ...candidates].filter(Boolean)) {
      if (candidate.runtime !== 'binary') continue;
      const profile = candidate.managedProfile || candidate.managedMetadata?.profile;
      if (candidate.managed && profile && !map.has(profile)) map.set(profile, candidate);
    }
    if (current?.runtime === 'binary' && current.managed && current.capabilityHint && ![...map.values()].some(candidate => candidate.id === current.id)) {
      const fallbackProfile = {
        cpu_safe: 'cpu_safe',
        apple: 'apple_metal',
        nvidia: 'nvidia_gpu',
        amd: 'amd_rocm',
        vulkan: 'vulkan',
        intel: 'intel_sycl',
      }[current.capabilityHint];
      if (fallbackProfile && !map.has(fallbackProfile)) map.set(fallbackProfile, current);
    }
    return map;
  }, [candidates, current]);
  const managedBuildRows = useMemo(() => {
    const profiles = new Set([
      ...INSTALL_PROFILE_ORDER.filter(profile => managedAssetsByProfile.has(profile)),
      ...installedManagedProfiles.keys(),
    ]);
    return [...profiles].map(profile => ({
      profile,
      assetInfo: managedAssetsByProfile.get(profile) || null,
      installed: installedManagedProfiles.get(profile) || null,
    }));
  }, [installedManagedProfiles, managedAssetsByProfile]);

  const primaryAction = useMemo(() => {
    // With a GPU driver problem the current engine already runs on the CPU.
    if (recommendation?.kind === 'gpu_driver_issue' && current) return null;
    if (recommendationCandidate && !recommendationCandidate.isCurrent) {
      return {
        key: engineKey(recommendationCandidate),
        label: 'Switch',
        icon: ArrowLeftRight,
        onClick: () => onSwitch?.({
          runtime: recommendationCandidate.runtime,
          path: recommendationCandidate.path,
        }, false),
      };
    }
    if (bestManagedAsset && recommendation?.state !== 'current_ok') {
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
  }, [bestManagedAsset, current, installProfile, onInstall, onSwitch, recommendation?.kind, recommendation?.state, recommendationCandidate]);

  const selectableCandidates = candidates.length > 0 ? candidates : (current ? [current] : []);
  const currentKey = engineKey(current);
  const mlxSupported = mlxStatus?.available ?? (
    (engineData?.hardware?.platform === 'darwin' && engineData?.hardware?.arch === 'arm64')
    || (engineData?.hardware?.platform === 'linux'
      && ['x64', 'arm64'].includes(engineData?.hardware?.arch))
  );
  const mlxReady = mlxSupported && mlxStatus?.mlxAvailable === true;
  const mlxLabel = !mlxSupported ? 'Not supported on this machine' : (mlxReady ? 'MLX runtime' : 'MLX runtime needs setup');
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
  const jobBytes = activeBuildJob ? '' : downloadProgressText(activeInstallJob);

  const submitCustom = (retry = false) => {
    const path = customPath.trim();
    if (!path) return;
    onSwitch?.({ runtime: customRuntime, path }, retry);
  };

  const handleEngineSelect = (key) => {
    const selected = selectableCandidates.find(candidate => engineKey(candidate) === key);
    if (!selected || selected.isCurrent) return;
    onSwitch?.({ runtime: selected.runtime, path: selected.path }, false);
  };

  const requestRemove = async (key) => {
    const name = key === 'python' ? 'Asyncat llama-cpp-python' : (INSTALL_PROFILE_LABELS[key] || 'This build');
    const ok = await confirm({
      title: 'Remove this engine?',
      message: `${name} is deleted from this computer. You can install it again later.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) onRemoveManagedEngine?.(key);
  };

  const busyKey = Boolean(switchingKey) || Boolean(installingKey);

  return (
    <div className="space-y-5">
      <SettingGroup>
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-[13px] font-medium text-fg">Runtime selections</h3>
            <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">
              {recommendationCopy(recommendation, current, engineData?.hardware)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {current?.capabilityLabel && <Badge>{current.capabilityLabel}</Badge>}
            {primaryAction && (
              <Button
                variant="primary"
                icon={primaryAction.icon}
                onClick={primaryAction.onClick}
                disabled={busyKey}
                loading={switchingKey === primaryAction.key || installingKey === primaryAction.key}
              >
                {primaryAction.label} recommended
              </Button>
            )}
            <Button icon={RefreshCw} onClick={() => onRescan?.({ clearActions: true })} loading={loading}>
              Rescan
            </Button>
          </div>
        </div>

        <SettingRow
          label="GGUF"
          detail={current?.path ? current.path : 'Used by downloaded llama.cpp models.'}
        >
          <Select
            value={selectableCandidates.length ? currentKey : ''}
            onChange={handleEngineSelect}
            disabled={selectableCandidates.length === 0 || busyKey}
            placeholder="Not detected"
            aria-label="GGUF engine"
            className="sm:w-[360px]"
            options={selectableCandidates.map(candidate => ({
              value: engineKey(candidate),
              label: engineTitle(candidate),
              hint: candidate.capabilityLabel || 'Runtime',
            }))}
          />
        </SettingRow>

        <SettingRow
          label="MLX"
          detail="Used by MLX model folders on Apple Silicon or Linux."
        >
          <div className="flex items-center gap-2 text-[13px] text-fg sm:w-[360px]">
            <span className="min-w-0">{mlxLabel}</span>
            <Badge color={mlxReady ? 'green' : (mlxSupported ? 'amber' : 'gray')}>
              {mlxReady ? 'Ready' : (mlxSupported ? 'Install' : 'System')}
            </Badge>
          </div>
        </SettingRow>
      </SettingGroup>

      {actionError && <Notice tone="error">{actionError}</Notice>}
      {actionSuccess && <SuccessNote>{actionSuccess}</SuccessNote>}
      {!actionError && !actionSuccess && installNotice && <Notice tone="info">{installNotice}</Notice>}

      {jobStatus && (
        <SettingGroup>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-fg">
                  {activeBuildJob ? 'Building runtime' : 'Installing runtime'}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-fg-muted">{jobMessage}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge color={installStatusTone(jobStatus)}>{jobStatus}</Badge>
                {(jobStatus === 'running' || jobStatus === 'queued') && (activeBuildJob ? onCancelBuild : onCancelInstall) && (
                  <Button variant="ghost" onClick={() => (activeBuildJob ? onCancelBuild() : onCancelInstall())}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            <Progress
              className="mt-3"
              value={Math.max(5, Math.min(100, jobProgress || 0))}
              tone={jobStatus === 'error' ? 'error' : 'accent'}
              label={activeBuildJob ? 'Building runtime' : 'Installing runtime'}
            />
            {jobBytes && (
              <p className="mt-1.5 text-[12px] tabular-nums text-fg-subtle">{jobBytes}</p>
            )}
          </div>
        </SettingGroup>
      )}

      <SettingGroup>
        <SettingRow
          label="Managed builds"
          detail="Install CPU-safe and hardware builds side by side, then switch between them below."
        >
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge>Stable</Badge>
            <Button icon={RefreshCw} onClick={() => onRefreshCatalog?.(true)} loading={loadingCatalog}>
              Check for updates
            </Button>
          </div>
        </SettingRow>

        {managedBuildRows.length === 0 && (
          <SettingRow
            label="No managed downloads"
            detail="No compatible release asset was found for this machine. Check for updates to look again."
          />
        )}

        {managedBuildRows.map((row) => {
          const installed = Boolean(row.installed);
          const isCurrent = Boolean(row.installed?.isCurrent);
          const assetInfo = row.assetInfo;
          const installedVersion = row.installed?.managedMetadata?.version;
          const installedAsset = row.installed?.managedMetadata?.asset;
          // llama.cpp tags a new build several times a day: only a newer
          // build is an update, and the row says how much newer.
          const behind = installed && assetInfo ? buildsBehind(installedVersion, assetInfo.release.tagName) : 0;
          const installedDetail = [installedVersion, installedAsset].filter(Boolean).join(' · ') || row.installed?.path;
          const detail = installed
            ? (behind > 0 ? `${installedDetail} · ${assetInfo.release.tagName} is out, ${buildsNewerText(behind)}` : installedDetail)
            : assetInfo
              ? `${assetInfo.release.tagName} · ${formatBytes(assetInfo.asset.sizeBytes ?? assetInfo.asset.size)} · ${assetInfo.asset.name}`
              : 'Installed manually or from an older Asyncat layout.';
          return (
            <SettingRow
              key={row.profile}
              label={INSTALL_PROFILE_LABELS[row.profile] || row.profile}
              detail={detail}
            >
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {isCurrent && <Badge color="blue">Selected</Badge>}
                {installed && !isCurrent && <Badge>Installed</Badge>}
                {installed && !isCurrent && (
                  <Button
                    onClick={() => onSwitch?.({ runtime: row.installed.runtime, path: row.installed.path }, false)}
                    disabled={busyKey}
                  >
                    Switch
                  </Button>
                )}
                {assetInfo && !installed && (
                  <Button
                    icon={Download}
                    onClick={() => onInstall?.({
                      profile: row.profile,
                      releaseTag: assetInfo.release.tagName,
                      assetName: assetInfo.asset.name,
                    }, false)}
                    disabled={Boolean(installingKey)}
                  >
                    Install
                  </Button>
                )}
                {assetInfo && installed && (
                  <Button
                    icon={RefreshCw}
                    onClick={() => onInstall?.({
                      profile: row.profile,
                      releaseTag: assetInfo.release.tagName,
                      assetName: assetInfo.asset.name,
                    }, false)}
                    disabled={Boolean(installingKey) || Boolean(removingKey)}
                  >
                    {behind > 0 ? 'Update' : 'Reinstall'}
                  </Button>
                )}
                {installed && (
                  <Button
                    variant="danger"
                    icon={Trash2}
                    onClick={() => requestRemove(row.profile)}
                    disabled={busyKey || Boolean(removingKey)}
                  >
                    {removingKey === row.profile ? 'Removing…' : 'Remove'}
                  </Button>
                )}
              </div>
            </SettingRow>
          );
        })}

        {installProfile && !bestManagedAsset && (
          <SettingRow
            label={`Build ${INSTALL_PROFILE_LABELS[installProfile]}`}
            detail="No managed download matched this machine, but Asyncat can try a local build."
          >
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button
                icon={TerminalSquare}
                onClick={() => onBuildGpuRuntime?.(installProfile, false)}
                disabled={Boolean(activeBuildJob)}
              >
                Build
              </Button>
              <Button
                icon={RefreshCw}
                onClick={() => onBuildGpuRuntime?.(installProfile, true)}
                disabled={!canRetry || Boolean(activeBuildJob)}
              >
                Build and retry
              </Button>
            </div>
          </SettingRow>
        )}
      </SettingGroup>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-[13px] font-semibold text-fg">Engines and frameworks</h3>
          <span className="text-[12px] text-fg-subtle">{hardwareSummary(engineData?.hardware)}</span>
        </div>
        <SettingGroup>
          {candidates.length === 0 && (
            <p className="px-4 py-5 text-[13px] text-fg-muted">
              No local chat runtimes were detected yet.
            </p>
          )}
          {candidates.map((candidate) => {
            const key = engineKey(candidate);
            const external = candidate.runtime === 'binary' && !candidate.managed;
            const versionTag = candidate.version?.build ? `b${candidate.version.build}` : null;
            const externalBehind = external ? buildsBehind(candidate.version?.build, latestBuild) : 0;
            const managedAlternative = externalBehind > 0
              ? managedAssetsByProfile.get(profileForCapability(candidate.capabilityHint)) || null
              : null;
            const RuntimeIcon = candidate.runtime === 'python' ? Settings2 : HardDrive;
            return (
              <div
                key={candidate.id || key}
                className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_auto] lg:items-center"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <RuntimeIcon className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium text-fg">{engineTitle(candidate)}</p>
                      {candidate.isCurrent && <Badge color="blue">Selected</Badge>}
                      {candidate.isRecommended && <Badge>Recommended</Badge>}
                      {candidate.managed && <Badge>Managed</Badge>}
                      <Badge>{candidate.capabilityLabel}</Badge>
                      {versionTag && <span className="font-mono text-[11px] text-fg-subtle">{versionTag}</span>}
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-fg-muted">{candidate.source || 'Detected runtime'}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle">{candidate.path}</p>
                    {externalBehind > 0 && (
                      <div className="mt-2 text-[12px] leading-5 text-fg-muted">
                        <p>
                          You have llama.cpp {versionTag}; {engineCatalog?.latestTag || 'a newer build'} is out ({buildsNewerText(externalBehind)}).
                          {' '}This copy wasn&apos;t installed by Asyncat, so update it the way you installed it, for example with your package manager.
                          {managedAlternative ? ' Or let Asyncat install and update a build for you.' : ''}
                        </p>
                        {managedAlternative && (
                          <Button
                            size="xs"
                            icon={Download}
                            className="mt-2"
                            onClick={() => onInstall?.({
                              profile: managedAlternative.profile,
                              releaseTag: managedAlternative.release.tagName,
                              assetName: managedAlternative.asset.name,
                            }, false)}
                            disabled={Boolean(installingKey)}
                          >
                            Install {INSTALL_PROFILE_LABELS[managedAlternative.profile] || 'a managed build'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-7 lg:justify-end lg:pl-0">
                  {candidate.isCurrent ? (
                    <span className="inline-flex h-8 items-center gap-1.5 px-1 text-[13px] font-medium text-accent">
                      <CheckCircle2 className="h-4 w-4" />
                      Active
                    </span>
                  ) : (
                    <Button
                      onClick={() => onSwitch?.({ runtime: candidate.runtime, path: candidate.path }, false)}
                      disabled={busyKey}
                      loading={switchingKey === key}
                    >
                      {switchingKey === key ? 'Switching…' : 'Switch'}
                    </Button>
                  )}
                  {!candidate.isCurrent && canRetry && (
                    <Button
                      onClick={() => onSwitch?.({ runtime: candidate.runtime, path: candidate.path }, true)}
                      disabled={busyKey}
                    >
                      Retry model
                    </Button>
                  )}
                  {candidate.managed && candidate.runtime === 'python' && (
                    <Button
                      variant="danger"
                      icon={Trash2}
                      onClick={() => requestRemove('python')}
                      disabled={busyKey || Boolean(removingKey)}
                    >
                      {removingKey === 'python' ? 'Removing…' : 'Remove'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </SettingGroup>
      </div>

      {missingRuntimeTools.length > 0 && (
        <Notice tone="warning">
          Missing runtime tools: {missingRuntimeTools.map(item => item.id).join(', ')}
          {installCommand && (
            <span className="mt-1 block select-all truncate font-mono">{installCommand}</span>
          )}
        </Notice>
      )}

      <SettingGroup>
        <button
          type="button"
          onClick={() => setShowAdvanced(value => !value)}
          aria-expanded={showAdvanced}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-fg">Use an engine by its path</span>
            <span className="mt-0.5 block text-[12px] leading-5 text-fg-muted">A llama-server or Python you installed yourself, retrying the model, or going back to the previous engine.</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>

        {showAdvanced && (
          <div className="px-4 py-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_auto]">
              <Select
                value={customRuntime}
                onChange={setCustomRuntime}
                aria-label="Runtime kind"
                options={CUSTOM_RUNTIMES}
              />
              <Input
                value={customPath}
                onChange={(event) => setCustomPath(event.target.value)}
                placeholder={customRuntime === 'python' ? '/path/to/python' : '/path/to/llama-server'}
                aria-label={customRuntime === 'python' ? 'Python path' : 'llama-server path'}
                className="font-mono"
              />
              <div className="flex gap-2">
                <Button
                  size="md"
                  onClick={() => submitCustom(false)}
                  disabled={!customPath.trim() || busyKey}
                >
                  Switch
                </Button>
                <Button
                  size="md"
                  onClick={() => submitCustom(true)}
                  disabled={!customPath.trim() || !canRetry || busyKey}
                >
                  Retry
                </Button>
              </div>
            </div>

            {revertSelection && (
              <Button
                icon={RotateCcw}
                className="mt-3"
                onClick={() => onSwitch?.(revertSelection, false)}
                disabled={busyKey}
              >
                Revert to previous engine
              </Button>
            )}
          </div>
        )}
      </SettingGroup>
    </div>
  );
};

export default EngineRuntimeSection;
