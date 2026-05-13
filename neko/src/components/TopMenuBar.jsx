// components/TopMenuBar.jsx - OS-style top menu bar
import { useState, useEffect, useRef } from "react";
import { Cpu, Mic, ServerCrash, Volume2, Wifi, WifiOff, Search, RotateCw } from "lucide-react";
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';
import useActiveBrainStatus from '../CommandCenter/hooks/useActiveBrainStatus.js';
import { audioApi } from '../Settings/settingApi.js';

// Time formatting helper
const formatSystemTime = (date) => (
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
);

// Format date helper
const formatSystemDate = (date) => (
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date)
);

// System Clock Component
const SystemClock = () => {
  const [time, setTime] = useState(() => formatSystemTime(new Date()));
  const [date, setDate] = useState(() => formatSystemDate(new Date()));

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(formatSystemTime(now));
      setDate(formatSystemDate(now));
    };

    const now = new Date();
    const delayUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let interval = null;

    const timeout = window.setTimeout(() => {
      updateTime();
      interval = window.setInterval(updateTime, 60 * 1000);
    }, delayUntilNextMinute);

    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 midnight:text-gray-300">
      <time className="text-sm font-medium" dateTime={new Date().toISOString()}>
        {time}
      </time>
      <span className="text-xs opacity-60 hidden sm:inline">•</span>
      <span className="text-xs opacity-70 hidden sm:inline">
        {date}
      </span>
    </div>
  );
};

// Network Status Component
const NetworkStatus = () => {
  const network = useNetworkStatus({ pollMs: 6000 });

  const status = !network.online
    ? {
        label: "No internet",
        detail: "This device is offline.",
        Icon: WifiOff,
        dotClassName: "bg-red-500",
        iconClassName: "text-red-500 dark:text-red-400 midnight:text-red-400",
        textClassName: "text-red-600 dark:text-red-400 midnight:text-red-400",
      }
    : !network.backendOnline
      ? {
          label: "Backend offline",
          detail: "Local Asyncat services are unreachable.",
          Icon: ServerCrash,
          dotClassName: "bg-amber-500",
          iconClassName: "text-amber-500 dark:text-amber-400 midnight:text-amber-400",
          textClassName: "text-amber-600 dark:text-amber-400 midnight:text-amber-400",
        }
      : {
          label: "Online",
          detail: "Browser and backend are reachable.",
          Icon: Wifi,
          dotClassName: "bg-emerald-500",
          iconClassName: "text-emerald-500 dark:text-emerald-400 midnight:text-emerald-400",
          textClassName: "text-emerald-600 dark:text-emerald-400 midnight:text-emerald-400",
        };

  const Icon = status.Icon;

  return (
    <div className="relative group flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${status.dotClassName}`} />
      <Icon className={`h-3.5 w-3.5 ${status.iconClassName}`} aria-hidden="true" />
      <span className={`text-xs font-medium hidden sm:inline ${status.textClassName}`}>
        {status.label}
      </span>
      {/* Tooltip */}
      <div className="pointer-events-none absolute right-0 top-full mt-2 w-max max-w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium leading-relaxed text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 dark:bg-gray-800 midnight:bg-gray-800 z-50">
        {status.detail}
      </div>
    </div>
  );
};

const shortModelName = (model) => {
  if (!model) return "";
  return String(model)
    .split(/[\\/]/)
    .pop()
    .replace(/\.(gguf|bin|onnx)$/i, "")
    .replace(/[-_]?Q\d+[_-]?[A-Z0-9]*$/i, "");
};

const useAudioModelActivity = ({ pollMs = 10000 } = {}) => {
  const [audioState, setAudioState] = useState({
    stt: { status: "idle", model: "" },
    tts: { status: "idle", model: "" },
  });

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const load = async () => {
      try {
        const [stt, tts] = await Promise.all([
          audioApi.whisper.getStatus().catch(() => ({ status: "idle" })),
          audioApi.tts.getStatus().catch(() => ({ status: "idle" })),
        ]);
        if (cancelled) return;
        setAudioState({
          stt: { status: stt?.status || "idle", model: shortModelName(stt?.model) },
          tts: { status: tts?.status || "idle", model: shortModelName(tts?.model) },
        });
      } finally {
        if (!cancelled) timer = window.setTimeout(load, pollMs);
      }
    };

    const refreshNow = () => {
      window.clearTimeout(timer);
      load();
    };

    load();
    window.addEventListener("asyncat-model-runtime-updated", refreshNow);
    window.addEventListener("asyncat-audio-models-updated", refreshNow);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("asyncat-model-runtime-updated", refreshNow);
      window.removeEventListener("asyncat-audio-models-updated", refreshNow);
    };
  }, [pollMs]);

  return audioState;
};

const normalizeRuntimeStatus = (status) => {
  if (status === "ready" || status === "loading" || status === "error") return status;
  return "idle";
};

const modelStatusMeta = {
  ready: {
    label: "Active",
    dotClassName: "bg-emerald-500",
    textClassName: "text-emerald-600 dark:text-emerald-400 midnight:text-emerald-400",
  },
  loading: {
    label: "Loading",
    dotClassName: "bg-amber-500 animate-pulse",
    textClassName: "text-amber-600 dark:text-amber-400 midnight:text-amber-400",
  },
  error: {
    label: "Error",
    dotClassName: "bg-red-500",
    textClassName: "text-red-600 dark:text-red-400 midnight:text-red-400",
  },
  idle: {
    label: "Idle",
    dotClassName: "bg-gray-300 dark:bg-gray-600 midnight:bg-gray-600",
    textClassName: "text-gray-500 dark:text-gray-400 midnight:text-gray-400",
  },
};

const ModelStatusRow = ({ Icon, label, detail, status }) => {
  const meta = modelStatusMeta[status] || modelStatusMeta.idle;

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className={`h-2 w-2 rounded-full ${meta.dotClassName}`} />
      <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 midnight:text-gray-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-200">
            {label}
          </span>
          <span className={`text-[11px] font-medium ${meta.textClassName}`}>
            {meta.label}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400 midnight:text-gray-400">
          {detail || "No model loaded"}
        </div>
      </div>
    </div>
  );
};

const ModelActivityIndicators = () => {
  const activeBrain = useActiveBrainStatus({ pollMs: 5000 });
  const audioState = useAudioModelActivity();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const llmStatus = activeBrain.isLoadingModel
    ? "loading"
    : activeBrain.isReady
      ? "ready"
      : normalizeRuntimeStatus(activeBrain.status);

  const items = [
    {
      key: "llm",
      Icon: Cpu,
      label: "LLM",
      status: llmStatus,
      detail: activeBrain.model
        ? `${activeBrain.providerName} · ${activeBrain.model}`
        : activeBrain.label,
    },
    {
      key: "stt",
      Icon: Mic,
      label: "STT",
      status: normalizeRuntimeStatus(audioState.stt.status),
      detail: audioState.stt.model,
    },
    {
      key: "tts",
      Icon: Volume2,
      label: "TTS",
      status: normalizeRuntimeStatus(audioState.tts.status),
      detail: audioState.tts.model,
    },
  ];

  const getIconColorClass = (items) => {
    const statuses = items.map(i => i.status);
    if (statuses.includes("loading")) return "text-amber-500 animate-pulse";
    if (statuses.includes("error")) return "text-red-500";
    if (statuses.every(s => s === "ready")) return "text-emerald-500";
    if (statuses.some(s => s === "ready")) return "text-amber-400";
    return "text-gray-400 dark:text-gray-500 midnight:text-gray-500";
  };

  const iconColorClass = getIconColorClass(items);

  return (
    <div ref={menuRef} className="relative hidden min-[360px]:block">
      <button
        type="button"
        onClick={() => setIsOpen(value => !value)}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 ${iconColorClass}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Model status"
      >
        <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white py-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
          <div className="border-b border-gray-100 px-3 pb-2 pt-1.5 dark:border-gray-800 midnight:border-slate-800">
            <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-200">
              Model Status
            </div>
            <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 midnight:text-gray-400">
              LLM, speech input, and speech output
            </div>
          </div>
          <div className="py-1">
            {items.map((item) => (
              <ModelStatusRow key={item.key} {...item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Main TopMenuBar Component
const TopMenuBar = ({ onSearchOpen }) => {
  const [isVisible, setIsVisible] = useState(() => {
    return localStorage.getItem('topMenuBarVisibility') !== 'hidden';
  });

  useEffect(() => {
    const checkVisibility = () => {
      const visibility = localStorage.getItem('topMenuBarVisibility');
      setIsVisible(visibility !== 'hidden');
    };

    const interval = setInterval(checkVisibility, 500);
    return () => clearInterval(interval);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[70] h-10 bg-white/90 dark:bg-gray-900/90 midnight:bg-slate-950/95 backdrop-blur-xl">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Left side - App Name */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-200">
            Asyncat
          </span>
        </div>

        {/* Right side - Actions and Status */}
        <div className="flex items-center gap-3">
          {/* Search button */}
          <button
            onClick={onSearchOpen}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:text-gray-400 midnight:hover:bg-gray-800 midnight:hover:text-gray-200"
            title="Search"
          >
            <Search className="h-3.5 w-3.5" />
          </button>

          {/* Refresh button */}
          <button
            onClick={() => window.location.reload()}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:text-gray-400 midnight:hover:bg-gray-800 midnight:hover:text-gray-200"
            title="Refresh"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>

          <ModelActivityIndicators />
          <NetworkStatus />
          <SystemClock />
        </div>
      </div>
    </div>
  );
};

export default TopMenuBar;
