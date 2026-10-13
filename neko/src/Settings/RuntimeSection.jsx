// Settings → Engines: a read-only overview of the local engines Asyncat
// uses, their versions and the disk space they take. Installing, updating and
// removing happen on the Models page, next to what each engine runs.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Cpu, HardDrive, Image as ImageIcon, Loader2, Mic, RefreshCw, Volume2 } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { llamaServerApi, runtimeApi } from './settingApi.js';

const ENGINES = [
  { id: 'llama', name: 'llama.cpp', use: 'Runs downloaded language models', icon: Cpu, manage: '/models?view=local' },
  { id: 'whisper', name: 'whisper.cpp', use: 'Speech to text', icon: Mic, manage: '/models?tab=audio' },
  { id: 'piper', name: 'Piper', use: 'Text to speech', icon: Volume2, manage: '/models?tab=audio' },
  { id: 'sd', name: 'stable-diffusion.cpp', use: 'Image generation', icon: ImageIcon, manage: '/models?tab=image' },
  { id: 'mlx', name: 'MLX LM', use: 'Language models on Apple Silicon', icon: Cpu, manage: '/models?view=local' },
];

function sourceLabel(entry) {
  if (!entry) return 'Not installed';
  if (entry.managed) return 'Installed by Asyncat';
  if (entry.found) return 'Found on this computer';
  return 'Not installed';
}

const RuntimeSection = () => {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, engines: {}, disk: [], root: '' });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const [llama, runtimes, disk] = await Promise.allSettled([
      llamaServerApi.getEngines(),
      runtimeApi.list(),
      runtimeApi.diskUsage(),
    ]);
    const engines = {};
    const current = llama.status === 'fulfilled' ? llama.value?.current : null;
    engines.llama = current
      ? {
        found: true,
        managed: Boolean(current.managed),
        version: current.version?.tag || (typeof current.version === 'string' ? current.version : ''),
        variant: current.capabilityLabel || '',
        path: current.path || '',
      }
      : { found: false };
    for (const runtime of runtimes.status === 'fulfilled' ? runtimes.value?.runtimes || [] : []) {
      engines[runtime.id] = {
        found: Boolean(runtime.detected),
        managed: Boolean(runtime.managedInstalled),
        version: runtime.version || '',
        variant: runtime.capability ? runtime.capability.replace('_safe', '').toUpperCase() : '',
        path: runtime.managedPath || runtime.configuredPath || '',
        supported: runtime.supported !== false,
      };
    }
    setState({
      loading: false,
      engines,
      disk: disk.status === 'fulfilled' ? disk.value?.engines || [] : [],
      root: disk.status === 'fulfilled' ? disk.value?.root || '' : '',
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const diskFor = (id) => state.disk.find((entry) => entry.id === id);
  const total = state.disk.reduce((sum, entry) => sum + (entry.bytes || 0), 0);
  const downloads = diskFor('downloads');
  const totalLabel = total > 0
    ? (() => {
      const mb = total / 1024 / 1024;
      return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
    })()
    : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] leading-5 text-fg-muted">
          Install, update or remove an engine on the Models page, next to what it runs.
          {totalLabel ? <> Asyncat&apos;s own copies use <strong className="font-medium text-fg">{totalLabel}</strong>.</> : null}
        </p>
        <Button size="sm" variant="ghost" icon={RefreshCw} loading={state.loading} onClick={load}>Refresh</Button>
      </div>

      <div className="divide-y divide-line rounded-xl border border-line bg-surface">
        {ENGINES.map((engine) => {
          const entry = state.engines[engine.id];
          if (engine.id === 'mlx' && entry && entry.supported === false) return null;
          const disk = diskFor(engine.id);
          const Icon = engine.icon;
          return (
            <div key={engine.id} className="flex items-center gap-3 px-4 py-3" data-engine-row={engine.id}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-fg-muted">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-fg">
                  {engine.name}
                  <span className="ml-2 font-normal text-fg-subtle">{engine.use}</span>
                </p>
                <p className="truncate text-[12px] text-fg-muted" title={entry?.path || ''}>
                  {state.loading && !entry
                    ? 'Checking…'
                    : [sourceLabel(entry), entry?.version, entry?.variant].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="shrink-0 text-right text-[12px] tabular-nums text-fg-muted">
                {disk?.exists ? disk.size : '—'}
              </span>
              <Button size="xs" variant="ghost" icon={ArrowUpRight} onClick={() => navigate(engine.manage)} aria-label={`Manage ${engine.name}`}>
                Manage
              </Button>
            </div>
          );
        })}
      </div>

      {downloads?.exists && downloads.bytes > 0 && (
        <p className="flex items-center gap-2 text-[12px] text-fg-muted">
          <HardDrive className="h-3.5 w-3.5" />
          Unfinished downloads keep {downloads.size} so an interrupted install can continue.
        </p>
      )}
      {state.root ? (
        <p className="break-all font-mono text-[11px] text-fg-subtle">Engines folder: {state.root}</p>
      ) : null}
      {state.loading && !state.disk.length ? <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" /> : null}
    </div>
  );
};

export default RuntimeSection;
