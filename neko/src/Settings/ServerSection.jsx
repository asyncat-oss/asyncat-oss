// Settings → About → Developer options: the local server's service address
// you can change, the settings it runs with (read-only), its database, and
// restarting it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, RotateCcw, Server, SlidersHorizontal } from 'lucide-react';
import { configApi, updateApi } from './settingApi';
import Button from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { storageApi } from '../files/storageApi.js';
import { formatBytes } from '../files/fileFormat.js';

const READ_ONLY = [
  { key: 'PORT', label: 'Server port' },
  { key: 'NODE_ENV', label: 'Environment' },
  { key: 'FRONTEND_URL', label: 'App address' },
  { key: 'DB_PATH', label: 'Database' },
  { key: 'LLAMA_SERVER_PORT', label: 'llama.cpp port' },
  { key: 'MLX_SERVER_PORT', label: 'MLX port' },
  { key: 'MODELS_PATH', label: 'Models folder' },
  { key: 'STORAGE_PATH', label: 'Storage folder' },
  { key: 'WHISPER_SERVER_PORT', label: 'Whisper port' },
  { key: 'WHISPER_BINARY_PATH', label: 'Whisper program' },
  { key: 'TTS_SERVER_PORT', label: 'Piper port' },
  { key: 'PIPER_BINARY_PATH', label: 'Piper program' },
  { key: 'IMAGEGEN_BINARY_PATH', label: 'Image engine program' },
  { key: 'MLX_PYTHON_PATH', label: 'MLX Python' },
  { key: 'MLX_MODELS_PATH', label: 'More MLX models' },
];

const EDITABLE = [
  {
    key: 'COMFYUI_BASE_URL',
    label: 'ComfyUI address',
    placeholder: 'http://127.0.0.1:8188',
    hint: 'Where the image generation tester looks for ComfyUI.',
  },
];

// The database's file and how many rows each table has (den's GET
// /api/storage/database).
function DatabaseTables() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    storageApi.database().then(setInfo).catch((err) => setInfo({ error: errorDetail(err) || "Couldn't read the database" }));
  }, []);
  const tables = [...(info?.tables || [])].sort((a, b) => (b.rows ?? -1) - (a.rows ?? -1) || a.name.localeCompare(b.name));
  return (
    <SettingsSection
      icon={Database}
      title="Database"
      hint={info?.path ? <span className="break-all font-mono">{info.path}</span> : null}
      aside={info?.totalBytes != null ? `${formatBytes(info.totalBytes)} · ${tables.length} tables` : null}
      data-database
    >
      {info?.error ? <Notice tone="error">{info.error}</Notice> : !info ? (
        <Skeleton className="h-32" />
      ) : (
        <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-canvas text-fg-subtle">
              <tr className="border-b border-line">
                <th className="px-4 py-2 text-left font-medium">Table</th>
                <th className="px-4 py-2 text-right font-medium">Rows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tables.map((table) => (
                <tr key={table.name}>
                  <td className="px-4 py-1.5 font-mono text-fg">{table.name}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-fg-muted">{table.rows == null ? '?' : table.rows.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsSection>
  );
}

const ServerSection = () => {
  const toast = useToast();
  const [config, setConfig] = useState({});
  const [effectiveConfig, setEffectiveConfig] = useState({});
  const [configSources, setConfigSources] = useState({});
  const [runtime, setRuntime] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [restartPhase, setRestartPhase] = useState(null); // null | 'restarting' | 'waiting' | 'done' | 'timeout'
  const restartCleanupRef = useRef(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await configApi.getConfig();
      if (cfg.success) {
        setConfig(cfg.config);
        setEffectiveConfig(cfg.effectiveConfig || cfg.config || {});
        setConfigSources(cfg.configSources || {});
        setRuntime(cfg.runtime || {});
      }
    } catch (err) {
      toast.error("Couldn't read the server settings", { detail: errorDetail(err) });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadConfig();
    return () => restartCleanupRef.current?.();
  }, [loadConfig]);

  const saveConfigValue = async (event, key, label) => {
    event.preventDefault();
    const value = editValues[key]?.trim();
    if (!value) return;
    setSaving(key);
    try {
      const res = await configApi.updateConfig(key, value);
      if (!res.success) throw new Error(res.error);
      setEditValues((prev) => ({ ...prev, [key]: '' }));
      await loadConfig();
      toast.success(`Saved the ${label}`);
    } catch (err) {
      toast.error("Couldn't save that", { detail: errorDetail(err) });
    } finally {
      setSaving(null);
    }
  };

  const restart = () => {
    restartCleanupRef.current?.();
    setRestartPhase('restarting');
    restartCleanupRef.current = updateApi.restart(
      () => setRestartPhase('waiting'),
      () => {
        setRestartPhase('done');
        setTimeout(() => window.location.reload(), 800);
      },
      () => setRestartPhase('timeout'),
    );
  };

  if (loading) return <Skeleton className="h-64 rounded-xl" />;

  const value = (key) => effectiveConfig[key] || config[key] || '';
  const restarting = restartPhase === 'restarting' || restartPhase === 'waiting';

  return (
    <div className="space-y-8" data-server>
      <SettingsSection icon={Server} title="Service addresses" hint="Optional services on this computer. A project's folder access is set in the project.">
        <RowGroup>
          {EDITABLE.map(({ key, label, placeholder, hint }) => (
            <SettingsRow key={key} label={label} hint={<>{hint} Now: <span className="font-mono">{value(key) || 'not set'}</span></>}>
              <form onSubmit={(event) => saveConfigValue(event, key, label)} className="flex items-center gap-2">
                <Input
                  value={editValues[key] ?? ''}
                  onChange={(event) => setEditValues((prev) => ({ ...prev, [key]: event.target.value }))}
                  placeholder={value(key) || placeholder}
                  aria-label={label}
                  className="w-full sm:w-60"
                />
                <Button type="submit" loading={saving === key} disabled={!editValues[key]?.trim()}>Save</Button>
              </form>
            </SettingsRow>
          ))}
        </RowGroup>
      </SettingsSection>

      <SettingsSection
        icon={SlidersHorizontal}
        title="Server settings"
        hint={<>What the server runs with, read-only. Start-up settings come from <span className="break-all font-mono">{runtime.envFile || '.env'}</span>; engines are set up in Models.</>}
      >
        <dl className="divide-y divide-line rounded-xl border border-line">
          {READ_ONLY.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
              <dt className="shrink-0 text-[13px] text-fg-muted sm:w-44">{label}</dt>
              <dd className="min-w-0 flex-1 break-all font-mono text-[12px] text-fg">{value(key) || <span className="font-sans text-fg-subtle">Not set</span>}</dd>
              <dd className="shrink-0 font-mono text-[11px] text-fg-subtle" title={`From ${configSources[key] || 'unknown'}`}>{key} · {configSources[key] || 'unknown'}</dd>
            </div>
          ))}
        </dl>
      </SettingsSection>

      <DatabaseTables />

      <SettingsSection icon={RotateCcw} title="Restart">
        <RowGroup>
          <SettingsRow
            label="Restart the server"
            hint={restartPhase === 'done'
              ? <span className="text-emerald-700 dark:text-emerald-400">The server is back. Reloading…</span>
              : restartPhase === 'timeout'
                ? <span className="text-amber-700 dark:text-amber-400">The server didn&apos;t restart by itself. Reopen the desktop app, or restart it from your supervisor.</span>
                : 'The desktop app restarts its own server. A copy run from source asks for a restart, which needs a supervisor such as systemd, pm2 or Docker.'}
          >
            <Button icon={RotateCcw} loading={restarting} disabled={restarting || restartPhase === 'done'} onClick={restart}>
              {restartPhase === 'restarting' ? 'Restarting…' : restartPhase === 'waiting' ? 'Waiting for the server…' : restartPhase === 'done' ? 'Reloading…' : 'Restart'}
            </Button>
          </SettingsRow>
        </RowGroup>
      </SettingsSection>
    </div>
  );
};

export default ServerSection;
