// LocalModelsSection.jsx — Built-in GGUF model manager
// Download, manage and delete local GGUF models stored in data/models/
// Includes live HuggingFace search

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Download,
  X,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  Database,
  HardDrive,
} from "lucide-react";
import { localModelsApi } from "./settingApi.js";

// ── Format helpers ────────────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  if (!bytes) return null;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
};

const formatSpeed = (bytesPerSec) => {
  if (!bytesPerSec || !isFinite(bytesPerSec)) return "0 B/s";
  if (bytesPerSec >= 1e9) return `${(bytesPerSec / 1e9).toFixed(2)} GB/s`;
  if (bytesPerSec >= 1e6) return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1e3) return `${(bytesPerSec / 1e3).toFixed(0)} KB/s`;
  return `${Math.round(bytesPerSec)} B/s`;
};

const formatETA = (secondsLeft) => {
  if (!secondsLeft || !isFinite(secondsLeft) || secondsLeft < 0) return "--:--";
  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = Math.floor(secondsLeft % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// Uses the HF search API: https://huggingface.co/api/models?search=...&filter=gguf
const useHFSearch = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const debounceRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&filter=gguf&limit=20&sort=downloads&direction=-1`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data || []);
    } catch {
      setSearchError("Could not reach HuggingFace. Check your connection.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback(
    (q) => {
      setQuery(q);
      clearTimeout(debounceRef.current);
      if (!q.trim()) {
        setResults([]);
        setSearchError(null);
        return;
      }
      debounceRef.current = setTimeout(() => search(q), 500);
    },
    [search],
  );

  return {
    query,
    handleQueryChange,
    results,
    searching,
    searchError,
    setResults,
    setQuery,
  };
};

// ── HF model file picker — fetches the list of .gguf files in a repo ──────────
const HFFilePicker = ({ repoId, onSelect, onClose }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const res = await fetch(`https://huggingface.co/api/models/${repoId}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("Failed to fetch model files");
        const data = await res.json();
        const ggufFiles = (data.siblings || []).filter(
          (f) => f.rfilename.endsWith(".gguf") || f.rfilename.endsWith(".bin"),
        );
        setFiles(ggufFiles);
      } catch {
        setError("Could not load model files.");
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, [repoId]);

  return (
    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate">
          {repoId}
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2 flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          </div>
        )}
        {error && <p className="text-xs text-red-500 px-3 py-2">{error}</p>}
        {!loading && !error && files.length === 0 && (
          <p className="text-xs text-gray-400 px-3 py-2">
            No GGUF files found in this repo.
          </p>
        )}
        {files.map((f) => (
          <button
            key={f.rfilename}
            onClick={() =>
              onSelect({
                url: `https://huggingface.co/${repoId}/resolve/main/${f.rfilename}`,
                filename: f.rfilename,
                repoId,
              })
            }
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-b border-gray-100 dark:border-gray-800 last:border-0"
          >
            <span className="text-xs text-gray-700 dark:text-gray-300 truncate font-mono">
              {f.rfilename}
            </span>
            {f.size && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0">
                {formatBytes(f.size)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const LocalModelsSection = ({ storage, onRefresh }) => {
  const [activeDownloads, setActiveDownloads] = useState({});
  const [showCustomUrl, setShowCustomUrl] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [customFilename, setCustomFilename] = useState("");
  const [customUrlError, setCustomUrlError] = useState("");

  // HF search state
  const {
    query,
    handleQueryChange,
    results,
    searching,
    searchError,
    setResults,
    setQuery,
  } = useHFSearch();
  const [expandedRepo, setExpandedRepo] = useState(null); // repoId whose files are shown

  const cleanupFnsRef = useRef({});

  useEffect(() => {
    localModelsApi
      .listDownloads()
      .then((res) => {
        if (res.success && res.downloads?.length > 0) {
          res.downloads.forEach((dl) => {
            if (dl.status === "downloading")
              startTrackingDownload(dl.downloadId, dl.filename);
          });
        }
      })
      .catch(() => {});
    return () => {
      Object.values(cleanupFnsRef.current).forEach((fn) => fn?.());
    };
  }, []);

  const startTrackingDownload = (downloadId, filename) => {
    setActiveDownloads((prev) => ({
      ...prev,
      [filename]: {
        downloadId,
        progress: 0,
        status: "downloading",
        downloadedFormatted: "0 B",
        totalFormatted: "?",
        speedFormatted: "0 B/s",
        etaFormatted: "--:--",
        _lastBytes: 0,
        _lastTime: Date.now(),
      },
    }));
    const cleanup = localModelsApi.streamDownloadProgress(
      downloadId,
      (data) =>
        setActiveDownloads((prev) => {
          const current = prev[filename] || {
            _lastBytes: 0,
            _lastTime: Date.now(),
          };
          const now = Date.now();
          const downloadedNow = data.downloaded || 0;

          let speedFormatted = current.speedFormatted || "0 B/s";
          let etaFormatted = current.etaFormatted || "--:--";
          let _lastBytes = current._lastBytes;
          let _lastTime = current._lastTime;

          // Update speed only if > 800ms have passed to avoid jitter
          if (now - current._lastTime > 800) {
            const bytesDiff = downloadedNow - current._lastBytes;
            const timeDiffSec = (now - current._lastTime) / 1000;
            const speedBps = bytesDiff > 0 ? bytesDiff / timeDiffSec : 0;

            if (speedBps > 0) {
              speedFormatted = formatSpeed(speedBps);
              if (data.total && data.total > downloadedNow) {
                etaFormatted = formatETA(
                  (data.total - downloadedNow) / speedBps,
                );
              } else {
                etaFormatted = "--:--";
              }
            } else if (bytesDiff === 0 && downloadedNow > 0) {
              speedFormatted = "0 B/s";
              etaFormatted = "--:--";
            }

            _lastBytes = downloadedNow;
            _lastTime = now;
          }

          return {
            ...prev,
            [filename]: {
              ...current,
              ...data,
              downloadId,
              speedFormatted,
              etaFormatted,
              _lastBytes,
              _lastTime,
            },
          };
        }),
      (data) => {
        setActiveDownloads((prev) => {
          const n = { ...prev };
          delete n[filename];
          return n;
        });
        if (data.status === "complete" && onRefresh) onRefresh();
        delete cleanupFnsRef.current[filename];
      },
      () => {
        setActiveDownloads((prev) => {
          const n = { ...prev };
          delete n[filename];
          return n;
        });
        delete cleanupFnsRef.current[filename];
      },
    );
    cleanupFnsRef.current[filename] = cleanup;
  };

  const handleDownload = async (url, filename) => {
    if (activeDownloads[filename]) return;
    try {
      const res = await localModelsApi.startDownload(url, filename);
      if (res.success) startTrackingDownload(res.downloadId, filename);
    } catch (err) {
      console.error("Failed to start download:", err);
    }
  };

  const handleCancelDownload = async (filename) => {
    const dl = activeDownloads[filename];
    if (!dl?.downloadId) return;
    try {
      await localModelsApi.cancelDownload(dl.downloadId);
      cleanupFnsRef.current[filename]?.();
      setActiveDownloads((prev) => {
        const n = { ...prev };
        delete n[filename];
        return n;
      });
    } catch (err) {
      console.error("Failed to cancel download:", err);
    }
  };

  const handleCustomDownload = async () => {
    setCustomUrlError("");
    if (!customUrl.trim()) {
      setCustomUrlError("URL is required");
      return;
    }
    if (!customFilename.trim()) {
      setCustomUrlError("Filename is required");
      return;
    }
    if (!customFilename.endsWith(".gguf") && !customFilename.endsWith(".bin")) {
      setCustomUrlError("Filename must end with .gguf or .bin");
      return;
    }
    try {
      new URL(customUrl);
    } catch {
      setCustomUrlError("Invalid URL");
      return;
    }
    await handleDownload(customUrl.trim(), customFilename.trim());
    setCustomUrl("");
    setCustomFilename("");
    setShowCustomUrl(false);
  };

  // When user picks a file from HF file picker
  const handleHFFilePick = ({ url, filename }) => {
    setExpandedRepo(null);
    setQuery("");
    setResults([]);
    handleDownload(url, filename);
  };

  return (
    <div className="space-y-6 w-full">
      {/* ── Active downloads — always visible ── */}
      {Object.keys(activeDownloads).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Downloading
          </h3>
          {Object.entries(activeDownloads).map(([filename, dl]) => {
            const pct = dl.progress || 0;
            const totalBytes = dl.total || 0;
            const freeAfterDownload =
              storage?.disk?.availableBytes && totalBytes
                ? Math.max(0, storage.disk.availableBytes - totalBytes)
                : null;
            return (
              <div
                key={filename}
                className="px-3 py-3 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 rounded-xl shadow-sm"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[80%] font-mono text-xs">
                    {filename}
                  </span>
                  <button
                    onClick={() => handleCancelDownload(filename)}
                    className="text-indigo-400 hover:text-red-500 transition-colors flex-shrink-0 ml-2"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>
                    {dl.downloadedFormatted || "0 B"} /{" "}
                    {dl.totalFormatted || "?"}
                  </span>
                  {dl.speedFormatted && dl.etaFormatted && (
                    <span className="opacity-80">
                      {dl.speedFormatted} • {dl.etaFormatted}
                    </span>
                  )}
                  <span className="font-mono font-medium text-gray-700 dark:text-gray-300">
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-600 dark:bg-gray-400 midnight:bg-gray-500 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {totalBytes > 0 && (
                    <span>Download size {formatBytes(totalBytes)}</span>
                  )}
                  {freeAfterDownload !== null && (
                    <span>
                      Free after download about {formatBytes(freeAfterDownload)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Storage info bar ── */}
      {storage && (
        <div className="px-4 py-3 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-300">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  Model Storage
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {storage.modelCount} model
                  {storage.modelCount !== 1 ? "s" : ""} taking{" "}
                  {storage.totalFormatted}
                </div>
              </div>
            </div>
            {storage.disk && (
              <div className="sm:min-w-72">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <HardDrive className="w-3.5 h-3.5" />
                    Device storage
                  </span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {storage.disk.availableFormatted} free
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-700 dark:bg-gray-300 midnight:bg-gray-400 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, storage.disk.usedPercent || 0))}%`,
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span>{storage.disk.usedFormatted} used</span>
                  <span>{storage.disk.totalFormatted} total</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HuggingFace live search ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Search HuggingFace
          </h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            GGUF models
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search models… e.g. llama, gemma, qwen"
            className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 rounded-lg bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600 midnight:focus:ring-gray-700 focus:border-gray-300 dark:focus:border-gray-600 midnight:focus:border-gray-700 transition-shadow"
          />
          {query && (
            <button
              onClick={() => {
                handleQueryChange("");
                setExpandedRepo(null);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search results */}
        {searching && (
          <div className="flex items-center gap-2 mt-3 text-xs text-gray-400 dark:text-gray-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Searching HuggingFace…
          </div>
        )}
        {searchError && (
          <p className="mt-2 text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {searchError}
          </p>
        )}
        {!searching && results.length > 0 && (
          <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {results.map((model, i) => {
              const repoId = model.modelId || model.id;
              const isExpanded = expandedRepo === repoId;
              const downloads = model.downloads
                ? `${(model.downloads / 1000).toFixed(0)}k downloads`
                : null;
              return (
                <div
                  key={repoId}
                  className={`border-b border-gray-100 dark:border-gray-800 last:border-0 ${i % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-gray-800/30"}`}
                >
                  <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {repoId}
                      </div>
                      {downloads && (
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                          {downloads}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        setExpandedRepo(isExpanded ? null : repoId)
                      }
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-white dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 midnight:bg-gray-800 midnight:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0 shadow-sm"
                    >
                      <Download className="w-3 h-3" />
                      {isExpanded ? "Hide" : "Select"}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <HFFilePicker
                        repoId={repoId}
                        onSelect={handleHFFilePick}
                        onClose={() => setExpandedRepo(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!searching && query && results.length === 0 && !searchError && (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            No GGUF models found for &quot;{query}&quot;
          </p>
        )}
      </div>

      {/* ── Custom URL download ── */}
      <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowCustomUrl((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Download from URL
          </div>
          {showCustomUrl ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {showCustomUrl && (
          <div className="p-4 space-y-3 bg-white dark:bg-gray-800 midnight:bg-gray-900">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-1">
                Model URL (HuggingFace or direct link)
              </label>
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://huggingface.co/.../model.gguf"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 rounded-lg bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600 midnight:focus:ring-gray-700 focus:border-gray-300 dark:focus:border-gray-600 midnight:focus:border-gray-700 transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-1">
                Save as filename
              </label>
              <input
                type="text"
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                placeholder="my-model.gguf"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 rounded-lg bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600 midnight:focus:ring-gray-700 focus:border-gray-300 dark:focus:border-gray-600 midnight:focus:border-gray-700 transition-shadow"
              />
            </div>
            {customUrlError && (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {customUrlError}
              </p>
            )}
            <button
              onClick={handleCustomDownload}
              className="flex items-center justify-center w-full gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-white dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 midnight:bg-gray-800 midnight:hover:bg-gray-700 rounded-lg transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Start Download
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocalModelsSection;
