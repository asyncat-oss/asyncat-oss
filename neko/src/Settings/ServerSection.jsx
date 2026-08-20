// Settings/ServerSection.jsx — local server configuration
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Server,
  Loader2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { configApi, updateApi, apiUtils } from "./settingApi";

const settingsFontBase = "font-sans";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 " +
  "bg-white dark:bg-gray-800 midnight:bg-gray-800 " +
  "text-gray-900 dark:text-gray-100 midnight:text-gray-100 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 " +
  "transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500";

const readOnlyCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200/60 dark:border-gray-700/40 midnight:border-gray-700/40 " +
  "bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-800/50 " +
  "text-gray-400 dark:text-gray-500 midnight:text-gray-500 text-sm cursor-default select-none";

const ServerSection = () => {
  const [config, setConfig] = useState({});
  const [effectiveConfig, setEffectiveConfig] = useState({});
  const [configSources, setConfigSources] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [runtime, setRuntime] = useState({});

  const [editValues, setEditValues] = useState({});

  // Restart state
  const [restartPhase, setRestartPhase] = useState(null); // null | 'restarting' | 'waiting' | 'done' | 'timeout'
  const restartCleanupRef = useRef(null);

  const flash = useCallback((msg, ms = 3000) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), ms);
  }, []);

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
      flash({
        type: "error",
        text: apiUtils.handleError(err, "Failed to load config"),
      });
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    loadConfig();
    return () => restartCleanupRef.current?.();
  }, [loadConfig]);

  const saveConfigValue = async (key) => {
    const value = editValues[key]?.trim();
    if (!value) {
      flash({ type: "error", text: `${key} cannot be empty` });
      return;
    }

    setSaving(true);
    try {
      const res = await configApi.updateConfig(key, value);
      if (!res.success) throw new Error(res.error);

      setEditValues((prev) => ({ ...prev, [key]: "" }));
      await loadConfig();
      flash({ type: "success", text: res.message || `${key} updated` });
    } catch (err) {
      flash({
        type: "error",
        text: apiUtils.handleError(err, "Failed to save"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = () => {
    restartCleanupRef.current?.();
    setRestartPhase("restarting");
    restartCleanupRef.current = updateApi.restart(
      () => setRestartPhase("waiting"),
      () => {
        setRestartPhase("done");
        setTimeout(() => window.location.reload(), 800);
      },
      () => setRestartPhase("timeout"),
    );
  };

  const nonEditableConfig = [
    { key: "PORT", label: "Server Port" },
    { key: "NODE_ENV", label: "Environment" },
    { key: "FRONTEND_URL", label: "Frontend URL" },
    { key: "DB_PATH", label: "Database Path" },
    { key: "LLAMA_SERVER_PORT", label: "LLM Server Port" },
    { key: "MLX_SERVER_PORT", label: "MLX Server Port" },
    { key: "MODELS_PATH", label: "Models Path" },
    { key: "STORAGE_PATH", label: "Storage Path" },
    { key: "WHISPER_SERVER_PORT", label: "Whisper STT Port" },
    { key: "WHISPER_BINARY_PATH", label: "Whisper Binary Path" },
    { key: "TTS_SERVER_PORT", label: "Piper TTS Port" },
    { key: "PIPER_BINARY_PATH", label: "Piper Binary Path" },
    { key: "IMAGEGEN_BINARY_PATH", label: "Simple Image Engine Binary Path" },
    { key: "MLX_PYTHON_PATH", label: "MLX Python Runtime" },
    { key: "MLX_MODELS_PATH", label: "Additional MLX Models Path" },
  ];

  const editableConfig = [
    {
      key: "COMFYUI_BASE_URL",
      label: "ComfyUI base URL",
      placeholder: "http://127.0.0.1:8188",
      help: "Controls where the image generation tester looks for ComfyUI. Default is http://127.0.0.1:8188.",
    },
  ];

  if (loading) {
    const skeletonRows = ["h-10", "h-8", "h-6"];
    return (
      <div className={`space-y-3 ${settingsFontBase}`}>
        {skeletonRows.map((heightClass) => (
          <div
            key={heightClass}
            className={`${heightClass} bg-gray-100 dark:bg-gray-800 rounded`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${settingsFontBase}`}>
      {message && (
        <div
          className={`p-4 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200 midnight:bg-green-900 midnight:text-green-300"
              : "bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200 midnight:bg-red-900 midnight:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Service endpoints */}
      <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Server size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Service endpoints
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Configure optional local services. Project folder access is managed from each Project.
        </p>

        <div className="space-y-4">
          {editableConfig.map(({ key, label, placeholder, help }) => {
            const currentValue = effectiveConfig[key] || config[key] || "(not set)";
            return (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-1.5">
                  {label}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editValues[key] ?? ""}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    placeholder={effectiveConfig[key] || config[key] || placeholder}
                    className={inputCls}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                  Current: {currentValue}
                </p>
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  {help}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveConfigValue(key)}
                    disabled={saving || !editValues[key]}
                    className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5
                    bg-gray-900 hover:bg-gray-700 dark:bg-gray-100 dark:hover:bg-white
                    midnight:bg-gray-100 midnight:hover:bg-white
                    text-white dark:text-gray-900 midnight:text-gray-900
                    disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : null}
                    Save {label}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Server Info (read-only) */}
      <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <RotateCcw size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Server Configuration
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Effective server settings (read-only). Engine paths and ports are
          managed from Runtime and Models. Bootstrap configuration is loaded
          from <code className="font-mono px-1 break-all">{runtime.envFile || '.env'}</code>.
        </p>

        <div className="space-y-3">
          {nonEditableConfig.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-1">
                {label}
              </label>
              <div className={readOnlyCls}>{effectiveConfig[key] || config[key] || "(not set)"}</div>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-600">
                Source: {configSources[key] || 'unknown'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Restart */}
      <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-6">
        <div className="flex items-center gap-2 mb-2">
          <RotateCcw size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Restart Server
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          The desktop app stops and starts its managed backend directly. A web
          or source deployment requests a graceful restart and requires a
          supervisor such as systemd, pm2, Docker, or an equivalent restart policy.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleRestart}
            disabled={
              restartPhase === "restarting" ||
              restartPhase === "waiting" ||
              restartPhase === "done"
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white
              midnight:bg-gray-100 midnight:hover:bg-white
              text-white dark:text-gray-900 midnight:text-gray-900
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {restartPhase === "restarting" || restartPhase === "waiting" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RotateCcw size={14} />
            )}
            {restartPhase === "restarting"
              ? "Restarting…"
              : restartPhase === "waiting"
                ? "Waiting for server…"
                : restartPhase === "done"
                  ? "Reloading…"
                  : "Restart server"}
          </button>

          {restartPhase === "done" && (
            <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 size={14} />
              Server is back — reloading page
            </span>
          )}

          {restartPhase === "timeout" && (
            <span className="inline-flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400 flex-wrap">
              <AlertTriangle size={14} className="shrink-0" />
              Server did not restart automatically. Relaunch the desktop app,
              or restart the backend from your source deployment supervisor.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServerSection;
